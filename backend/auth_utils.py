"""
Auth helpers: password hashing, JWT creation/verification.
"""

import os
import hashlib
import hmac
import secrets
import logging
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from database import get_db, FileDB

logger = logging.getLogger(__name__)

SECRET_KEY   = os.getenv("JWT_SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_use_32+_chars")
ALGORITHM    = "HS256"
TOKEN_EXPIRE = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24 h
bearer  = HTTPBearer()

PBKDF2_ITERS = int(os.getenv("PBKDF2_ITERS", "390000"))


# ── Passwords ─────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    salt = secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), PBKDF2_ITERS).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERS}${salt}${derived}"

def verify_password(plain: str, hashed: str) -> bool:
    try:
        algo, iter_str, salt, digest = hashed.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        check = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), int(iter_str)).hex()
        return hmac.compare_digest(check, digest)
    except Exception:
        return False


# ── Tokens ────────────────────────────────────────────────────────────
def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> str:
    """Returns user_id or raises 401."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        uid = payload.get("sub")
        if not uid:
            raise ValueError
        return uid
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


# ── FastAPI dependency ────────────────────────────────────────────────
async def current_user_id(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: FileDB = Depends(get_db),
) -> str:
    uid = decode_token(creds.credentials)
    row = await db.get_user_by_id(uid)
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return uid


# ── Token encryption for storing GitHub PATs ─────────────────────────
from cryptography.fernet import Fernet

_FERNET_KEY = os.getenv("FERNET_KEY", Fernet.generate_key().decode())
_fernet = Fernet(_FERNET_KEY.encode() if isinstance(_FERNET_KEY, str) else _FERNET_KEY)

def encrypt_token(plain: str) -> str:
    return _fernet.encrypt(plain.encode()).decode()

def decrypt_token(enc: str) -> str:
    return _fernet.decrypt(enc.encode()).decode()
