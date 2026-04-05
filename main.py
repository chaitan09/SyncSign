import os
import uuid
from pathlib import Path
from typing import Dict, Optional, List
import qrcode
from io import BytesIO
import base64
import json
import fitz  # PyMuPDF
import numpy as np
import asyncio
from datetime import datetime, timedelta

from fastapi import FastAPI, File, Form, Request, UploadFile, WebSocket, WebSocketDisconnect, Body, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from PIL import Image
from fastapi.background import BackgroundTasks

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

templates = Jinja2Templates(directory="templates")


# In-memory session store for MVP
sessions: Dict[str, Dict] = {}

# Security: Allowed file formats
ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg'}

# Security: Maximum file size (15 MB)
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB in bytes

# Auto-cleanup: Delete files from disk after download or timeout
async def schedule_auto_cleanup(session_id: str, delay_minutes: int = 15):
    """Schedule automatic cleanup of files after specified delay."""
    await asyncio.sleep(delay_minutes * 60)  # Convert minutes to seconds
    
    # Check if session still exists
    if session_id in sessions:
        session = sessions[session_id]
        if not session.get("downloaded", False):
            print(f"🗑️ Auto-cleanup: Deleting files for session {session_id} (15 min timeout)")
            delete_files_from_disk(session_id)
        
        # Clear session data from memory after 15 minutes
        sessions.pop(session_id, None)
        print(f"✅ Session {session_id} cleared from memory after 15 minutes")

async def cleanup_after_download(session_id: str, delay_seconds: int = 30):
    """Delete files from disk after download completes."""
    await asyncio.sleep(delay_seconds)
    
    if session_id in sessions:
        print(f"🗑️ Post-download cleanup: Deleting files from disk for session {session_id}")
        delete_files_from_disk(session_id)
        # Session data stays in memory for 15 minutes total

def delete_files_from_disk(session_id: str):
    """Delete physical files from uploads folder (keeps session data in memory)."""
    session = sessions.get(session_id)
    if not session:
        return
    
    files_to_delete = []
    
    # Original uploaded file
    if "stored_name" in session:
        files_to_delete.append(UPLOAD_DIR / session["stored_name"])
    
    # Preview PDF (if any)
    if "preview_file" in session:
        files_to_delete.append(UPLOAD_DIR / session["preview_file"])
    
    # Original file (if different from stored_name)
    if "original_file" in session and session["original_file"] != session.get("stored_name"):
        files_to_delete.append(UPLOAD_DIR / session["original_file"])
    
    # Delete files from disk
    for file_path in files_to_delete:
        if file_path.exists():
            try:
                file_path.unlink()
                print(f"✅ Deleted from disk: {file_path.name}")
            except Exception as e:
                print(f"⚠️ Error deleting {file_path.name}: {e}")
    
    # Mark files as deleted in session
    session["files_deleted"] = True
    print(f"✅ Files deleted from disk for session {session_id}, session data kept in memory")

def cleanup_session_files(session_id: str):
    """DEPRECATED: Use delete_files_from_disk() instead. This function for backward compatibility."""
    delete_files_from_disk(session_id)

# In-memory session store for MVP
sessions: Dict[str, Dict] = {}

def tint_signature(image_path: Path, color_hex: str) -> Path:
    """
    Tint a signature image to a specific color.
    Keeps transparency, changes black pixels to the target color.
    """
    if color_hex == "#000000":  # If black, no tinting needed
        return image_path
    
    # Open image
    img = Image.open(image_path).convert("RGBA")
    data = np.array(img)
    
    # Parse hex color to RGB
    r = int(color_hex[1:3], 16)
    g = int(color_hex[3:5], 16)
    b = int(color_hex[5:7], 16)
    
    # Find non-transparent pixels
    alpha = data[:, :, 3]
    has_color = alpha > 0
    
    # Change RGB values but keep alpha
    data[has_color, 0] = r  # Red channel
    data[has_color, 1] = g  # Green channel
    data[has_color, 2] = b  # Blue channel
    
    # Save tinted image
    tinted_img = Image.fromarray(data)
    tinted_path = image_path.parent / f"{image_path.stem}_tinted.png"
    tinted_img.save(tinted_path)
    
    return tinted_path

# Endpoint to reset session and delete uploaded file
@app.post("/reset/{session_id}")
async def reset_session(session_id: str):
    session = sessions.pop(session_id, None)
    if session:
        file_path = UPLOAD_DIR / session["stored_name"]
        if file_path.exists():
            file_path.unlink()
        return JSONResponse({"success": True})
    return JSONResponse({"success": False, "error": "Session not found"}, status_code=404)

class ConnectionManager:
    def __init__(self):
        self.laptop_connections: Dict[str, WebSocket] = {}
        self.mobile_connections: Dict[str, WebSocket] = {}

    async def connect_laptop(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.laptop_connections[session_id] = websocket

    async def connect_mobile(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.mobile_connections[session_id] = websocket

    def disconnect_laptop(self, session_id: str):
        self.laptop_connections.pop(session_id, None)

    def disconnect_mobile(self, session_id: str):
        self.mobile_connections.pop(session_id, None)

    async def send_to_laptop(self, session_id: str, data: dict):
        ws = self.laptop_connections.get(session_id)
        if ws:
            await ws.send_json(data)

    async def send_to_mobile(self, session_id: str, data: dict):
        ws = self.mobile_connections.get(session_id)
        if ws:
            await ws.send_json(data)


manager = ConnectionManager()


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/upload")
async def upload_document(request: Request, file: UploadFile = File(...)):
    session_id = str(uuid.uuid4())[:8]

    ext = Path(file.filename or "document.pdf").suffix.lower()
    
    # Security: Validate file format
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Only PDF, PNG, and JPG files are allowed. You uploaded: {ext}"
        )
    
    safe_name = f"{session_id}{ext}"
    file_path = UPLOAD_DIR / safe_name

    content = await file.read()
    
    # Security: Validate file size (15 MB limit)
    file_size = len(content)
    if file_size > MAX_FILE_SIZE:
        file_size_mb = file_size / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is 15 MB. Your file is {file_size_mb:.2f} MB."
        )
    
    with open(file_path, "wb") as f:
        f.write(content)

    # Initialize session data
    session_data = {
        "filename": file.filename,
        "stored_name": safe_name,
        "file_url": f"/uploads/{safe_name}",
        "mobile_connected": False,
        "original_ext": ext,
        "original_file": safe_name,
        "downloaded": False,  # Track if file has been downloaded
        "upload_time": datetime.now()
    }

    sessions[session_id] = session_data
    
    # Schedule auto-cleanup after 15 minutes
    asyncio.create_task(schedule_auto_cleanup(session_id, delay_minutes=15))
    print(f"⏰ Auto-cleanup scheduled for session {session_id} in 15 minutes")

    return RedirectResponse(url=f"/laptop/{session_id}", status_code=303)


@app.get("/preview/{session_id}")
async def preview_pdf_as_image(session_id: str, page: int = 0, dpi: int = 150):
    """
    Render a PDF page as a PNG image.
    
    WHY: Browser's native PDF viewer (iframe) has a toolbar, margins,
    and zoom that we CANNOT measure from JavaScript. This makes
    coordinate mapping impossible.
    
    By rendering the PDF as an <img>, the image dimensions ARE the
    document dimensions. No hidden offsets. Pixel-perfect coordinates.
    
    Args:
        session_id: session identifier
        page: page number (0-indexed)
        dpi: render resolution (150 = good balance of quality vs speed)
    """
    session = sessions.get(session_id)
    if not session:
        return JSONResponse({"error": "Invalid session"}, status_code=404)
    
    # Determine which file to use for preview
    file_path = UPLOAD_DIR / session["stored_name"]
    
    if not file_path.exists():
        return JSONResponse({"error": "File not found"}, status_code=404)
    
    ext = file_path.suffix.lower()
    if ext != '.pdf':
        # For non-PDF files, just redirect to the original file
        return RedirectResponse(url=session["file_url"])
    
    # Render PDF page as PNG using PyMuPDF
    doc = fitz.open(str(file_path))
    if page >= len(doc):
        doc.close()
        return JSONResponse({"error": "Page not found"}, status_code=404)
    
    pdf_page = doc[page]
    
    # render at specified DPI (default 150 for good quality)
    # zoom = dpi / 72 (PDF default is 72 DPI)
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = pdf_page.get_pixmap(matrix=mat)  # type: ignore
    
    # Convert to PNG bytes
    png_bytes = pix.tobytes("png")
    doc.close()
    
    # Return as streaming response with PNG content type
    return StreamingResponse(
        BytesIO(png_bytes),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"}
    )


@app.get("/pdf-info/{session_id}")
async def pdf_info(session_id: str):
    """
    Return PDF page count and first page dimensions.
    Frontend needs this to show page navigation and calculate scale factor.
    """
    session = sessions.get(session_id)
    if not session:
        return JSONResponse({"error": "Invalid session"}, status_code=404)
    
    # Get the stored file
    file_path = UPLOAD_DIR / session["stored_name"]
    
    if not file_path.exists():
        return JSONResponse({"error": "File not found"}, status_code=404)
    
    ext = file_path.suffix.lower()
    if ext != '.pdf':
        # For non-PDF files (images), return single page
        return JSONResponse({
            "width": 0,
            "height": 0,
            "pageCount": 1
        })
    
    doc = fitz.open(str(file_path))
    page = doc[0]
    rect = page.rect
    page_count = len(doc)
    doc.close()
    
    return JSONResponse({
        "width": rect.width,
        "height": rect.height,
        "pageCount": page_count
    })


@app.get("/laptop/{session_id}", response_class=HTMLResponse)
async def laptop_page(request: Request, session_id: str):
    session = sessions.get(session_id)
    if not session:
        return HTMLResponse("Invalid session", status_code=404)



    # Get the host IP address from the incoming request
    import socket
    # def get_local_ip():
    #     s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    #     try:
    #         # doesn't have to be reachable
    #         s.connect(('10.255.255.255', 1))
    #         IP = s.getsockname()[0]
    #     except Exception:
    #         IP = '127.0.0.1'
    #     finally:
    #         s.close()
    #     return IP

    # current_ip = get_local_ip()
    # qr_link = f"http://{current_ip}:8000/mobile/{session_id}"
    base_url = str(request.base_url).rstrip("/")
    mobile_url = f"{base_url}/mobile/{session_id}"
    qr = qrcode.make(mobile_url)
    buffer = BytesIO()
    qr.save(buffer, "PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()

    # For Word documents, we need both the preview PDF and original Word file
    original_file_url = f"/uploads/{session.get('original_file', session['stored_name'])}"
    
    return templates.TemplateResponse(
        "laptop.html",
        {
            "request": request,
            "session_id": session_id,
            "file_url": session["file_url"],  # Preview URL (PDF for Word docs)
            "original_file_url": original_file_url,  # Original file URL
            "filename": session["filename"],
            "file_ext": Path(session["filename"]).suffix.lower(),
            "mobile_url": mobile_url,
            "qr_base64": qr_base64,
            "qr_link": qr_link,
        },
    )


@app.get("/mobile/{session_id}", response_class=HTMLResponse)
async def mobile_page(request: Request, session_id: str):
    session = sessions.get(session_id)
    if not session:
        return HTMLResponse("Invalid session", status_code=404)

    return templates.TemplateResponse(
        "mobile.html",
        {
            "request": request,
            "session_id": session_id,
        },
    )


@app.websocket("/ws/laptop/{session_id}")
async def websocket_laptop(websocket: WebSocket, session_id: str):
    await manager.connect_laptop(session_id, websocket)

    try:
        await manager.send_to_laptop(session_id, {
            "type": "status",
            "message": "Laptop connected"
        })

        while True:
            data = await websocket.receive_json()

            # Future use: save position, final export, etc.
            if data.get("type") == "ping":
                await manager.send_to_laptop(session_id, {"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect_laptop(session_id)


@app.websocket("/ws/mobile/{session_id}")
async def websocket_mobile(websocket: WebSocket, session_id: str):
    await manager.connect_mobile(session_id, websocket)

    try:
        sessions[session_id]["mobile_connected"] = True
        await manager.send_to_laptop(session_id, {
            "type": "status",
            "message": "Mobile connected"
        })

        while True:
            data = await websocket.receive_json()

            if data.get("type") == "signature":
                await manager.send_to_laptop(session_id, {
                    "type": "signature",
                    "image": data.get("image")
                })

            elif data.get("type") == "clear":
                await manager.send_to_laptop(session_id, {
                    "type": "clear_signature"
                })

    except WebSocketDisconnect:
        sessions[session_id]["mobile_connected"] = False
        manager.disconnect_mobile(session_id)
        await manager.send_to_laptop(session_id, {
            "type": "status",
            "message": "Mobile disconnected"
        })


@app.post("/embed/{session_id}")
async def embed_signature(session_id: str, data: dict = Body(...)):
    """
    PART 3: BACKEND - Embed signature into document
    
    This is the main logic that:
    1. Converts base64 → image file
    2. Opens document (PDF or Word original)
    3. Converts UI coordinates → document coordinates
    4. 🔥 Inserts signature
    5. Saves new document in ORIGINAL format
    6. Returns download
    
    NEW: Supports multi-page signatures
    data format: {
        "signaturesByPage": {
            "1": [signature1, signature2, ...],
            "3": [signature3, ...],
            ...
        },
        "pdfDisplayWidth": 800,
        "pdfDisplayHeight": 1132
    }
    """
    session = sessions.get(session_id)
    if not session:
        return JSONResponse({"error": "Invalid session"}, status_code=404)
    
    try:
        # Support both old format (signatures array) and new format (signaturesByPage object)
        signatures_by_page = data.get("signaturesByPage", {})
        
        # Backward compatibility: if old format is used, treat as page 1
        if not signatures_by_page and "signatures" in data:
            old_signatures = data.get("signatures", [])
            if old_signatures:
                signatures_by_page = {"1": old_signatures}
        
        if not signatures_by_page:
            return JSONResponse({"error": "No signatures provided"}, status_code=400)
        
        # For PDF and images, use stored_name
        file_path = UPLOAD_DIR / session["stored_name"]
        
        if not file_path.exists():
            return JSONResponse({"error": "Original file not found"}, status_code=404)
        
        ext = file_path.suffix.lower()
        # Output file keeps original extension
        output_path = UPLOAD_DIR / f"{session_id}_signed{ext}"
        
        print(f"📁 Processing file save:")
        print(f"   Original file: {file_path.name}")
        print(f"   Extension: {ext}")
        print(f"   Output file: {output_path.name}")
        
        if ext == '.pdf':
            # STEP B: Open PDF
            doc = fitz.open(str(file_path))
            
            # Get display dimensions from frontend
            displayed_width = data.get("pdfDisplayWidth", 0)
            displayed_height = data.get("pdfDisplayHeight", 0)
            
            # Process signatures for each page
            for page_num_str, signatures in signatures_by_page.items():
                page_num = int(page_num_str) - 1  # Convert to 0-indexed
                
                if page_num >= len(doc) or page_num < 0:
                    print(f"⚠️ Skipping invalid page number: {page_num + 1}")
                    continue
                
                page = doc[page_num]
                page_rect = page.rect
                pdf_page_width = page_rect.width
                pdf_page_height = page_rect.height
                
                # Calculate scale factor for this page
                if displayed_width > 0 and displayed_height > 0:
                    scale_x = pdf_page_width / displayed_width
                    scale_y = pdf_page_height / displayed_height
                else:
                    scale_x = scale_y = 1.0
                
                print(f"📄 Processing page {page_num + 1} with {len(signatures)} signature(s)")
                
                # Process each signature on this page
                for sig in signatures:
                    # STEP A: Convert base64 → image
                    image_data = sig['image'].split(',')[1] if ',' in sig['image'] else sig['image']
                    image_bytes = base64.b64decode(image_data)
                    
                    img_path = UPLOAD_DIR / f"{session_id}_sign_{uuid.uuid4()}.png"
                    with open(img_path, "wb") as f:
                        f.write(image_bytes)
                    
                    # Apply color tint if specified
                    color_hex = sig.get('color', '#000000')
                    if color_hex and color_hex != '#000000':
                        original_path = img_path
                        img_path = tint_signature(img_path, color_hex)
                        original_path.unlink()  # Delete original black signature
                    
                    # STEP C: Convert UI position → PDF coordinates
                    pdf_x = sig['x'] * scale_x
                    pdf_w = sig['width'] * scale_x
                    pdf_h = sig['height'] * scale_y
                    pdf_y = sig['y'] * scale_y
                    
                    # Create rectangle: (left, top, right, bottom)
                    rect = fitz.Rect(pdf_x, pdf_y, pdf_x + pdf_w, pdf_y + pdf_h)
                    rect = rect & page_rect  # Clamp to page boundaries
                    
                    print(f"[EMBED] Page {page_num + 1}: Browser pos=({sig['x']:.1f}, {sig['y']:.1f}) size=({sig['width']:.1f}x{sig['height']:.1f})")
                    print(f"[EMBED] Page {page_num + 1}: PDF rect=({rect.x0:.1f}, {rect.y0:.1f}, {rect.x1:.1f}, {rect.y1:.1f})")
                    
                    # STEP E: 🔥 INSERT SIGNATURE
                    page.insert_image(rect, filename=str(img_path), rotate=sig.get('rotation', 0))  # type: ignore
                    img_path.unlink()
            
            # STEP F: Save new PDF
            doc.save(str(output_path))
            doc.close()
            
        else:
            # For images (PNG/JPG), use PIL to embed signatures
            # Images are always single page, so use page 1 signatures
            signatures = signatures_by_page.get("1", [])
            
            if not signatures:
                return JSONResponse({"error": "No signatures for image"}, status_code=400)
            
            base_img = Image.open(file_path)
            
            # Get actual image dimensions (natural size)
            actual_width = base_img.width
            actual_height = base_img.height
            
            # Get display dimensions from frontend (how big it appeared on screen)
            displayed_width = data.get("pdfDisplayWidth", actual_width)
            displayed_height = data.get("pdfDisplayHeight", actual_height)
            
            # Calculate scaling ratio: actual file size / displayed screen size
            scale_x = actual_width / displayed_width
            scale_y = actual_height / displayed_height
            
            print(f"[IMAGE] Actual dimensions: {actual_width} x {actual_height}")
            print(f"[IMAGE] Display dimensions: {displayed_width} x {displayed_height}")
            print(f"[IMAGE] Scale factors: {scale_x:.4f} x {scale_y:.4f}")
            
            for sig in signatures:
                image_data = sig['image'].split(',')[1] if ',' in sig['image'] else sig['image']
                image_bytes = base64.b64decode(image_data)
                sig_img = Image.open(BytesIO(image_bytes)).convert("RGBA")
                
                # Apply color tint if specified
                color_hex = sig.get('color', '#000000')
                if color_hex and color_hex != '#000000':
                    sig_array = np.array(sig_img)
                    r = int(color_hex[1:3], 16)
                    g = int(color_hex[3:5], 16)
                    b = int(color_hex[5:7], 16)
                    alpha = sig_array[:, :, 3]
                    has_color = alpha > 0
                    sig_array[has_color, 0] = r
                    sig_array[has_color, 1] = g
                    sig_array[has_color, 2] = b
                    sig_img = Image.fromarray(sig_array)
                
                # Apply scaling ratio to convert screen coordinates to file coordinates
                file_x = int(sig['x'] * scale_x)
                file_y = int(sig['y'] * scale_y)
                file_width = int(sig['width'] * scale_x)
                file_height = int(sig['height'] * scale_y)
                
                print(f"[IMAGE] Screen pos: ({sig['x']:.1f}, {sig['y']:.1f}) size: {sig['width']:.1f}x{sig['height']:.1f}")
                print(f"[IMAGE] File pos: ({file_x}, {file_y}) size: {file_width}x{file_height}")
                
                # Resize signature to match scaled dimensions
                sig_img = sig_img.resize((file_width, file_height))
                
                # Apply rotation if specified
                if sig.get('rotation', 0) != 0:
                    sig_img = sig_img.rotate(-sig['rotation'], expand=True)
                
                # Paste signature onto base image at scaled position
                base_img.paste(sig_img, (file_x, file_y), sig_img if sig_img.mode == 'RGBA' else None)
            
            base_img.save(output_path)
            print(f"✅ Saved signed image: {output_path.name}")
        
        # Return downloadable file with correct MIME type
        if ext == '.pdf':
            media_type = "application/pdf"
        elif ext in ['.png']:
            media_type = "image/png"
        elif ext in ['.jpg']:
            media_type = "image/jpeg"
        else:
            media_type = "application/octet-stream"
        
        # Mark session as downloaded (prevent auto-cleanup)
        session["downloaded"] = True
        print(f"✅ Download initiated for session {session_id}")
        
        # Schedule cleanup after successful download
        # Give 30 seconds for download to complete, then clean up
        asyncio.create_task(cleanup_after_download(session_id, delay_seconds=30))
        
        return FileResponse(
            path=str(output_path),
            media_type=media_type,
            filename=f"signed_{session['filename']}"
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)
