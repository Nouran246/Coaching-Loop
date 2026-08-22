import os
import re
import uuid
from pathlib import Path
from dotenv import load_dotenv
import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles

from pdf_extractor import extract_report_data

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv()

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_AGENT_ID = os.environ.get("ELEVENLABS_AGENT_ID", "")


app = FastAPI(title="Coaching Loop Hub")

ALLOWED_EXTENSIONS = {".pdf", ".docx"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .pdf or .docx files are accepted.")

    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or "upload")
    stored_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
    dest = UPLOAD_DIR / stored_name

    contents = await file.read()
    max_bytes = 25 * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(status_code=400, detail="File exceeds the 25MB limit.")

    dest.write_bytes(contents)

    extracted = None
    if ext == ".pdf":
        try:
            extracted = extract_report_data(str(dest))
        except Exception as e:
            # Never fail the upload just because extraction had trouble.
            extracted = {"error": f"Extraction failed: {e}"}

    return {
        "filename": file.filename,
        "stored_as": stored_name,
        "size": len(contents),
        "extracted": extracted,
    }


class AgentSessionRequest(BaseModel):
    work_id: str


@app.post("/api/get-signed-url")
async def get_signed_url(request: AgentSessionRequest):
    work_id = request.work_id.strip()

    if not work_id:
        raise HTTPException(status_code=400, detail="Work ID is required.")

    if not ELEVENLABS_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="ELEVENLABS_API_KEY is not configured on the server."
        )

    if not ELEVENLABS_AGENT_ID:
        raise HTTPException(
            status_code=500,
            detail="ELEVENLABS_AGENT_ID is not configured on the server."
        )

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
            params={"agent_id": ELEVENLABS_AGENT_ID},
            headers={"xi-api-key": ELEVENLABS_API_KEY},
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"ElevenLabs error: {resp.text}"
        )

    data = resp.json()

    # The Work ID is intentionally kept in our application layer.
    # It can later be validated against the company's employee system
    # and/or passed into the ElevenLabs workflow as session context.
    return {
        "signed_url": data["signed_url"],
        "work_id": work_id,
    }


# Serve the frontend last, so /api/* routes above take priority
app.mount("/", StaticFiles(directory=BASE_DIR / "static", html=True), name="static")