"""Auth endpoints: POST /api/auth/signup  POST /api/auth/login"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status

from database import get_db, FileDB
from schemas import SignUpRequest, LoginRequest, TokenResponse, UserOut
from auth_utils import hash_password, verify_password, create_access_token

router = APIRouter()


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignUpRequest, db: FileDB = Depends(get_db)):
    # Check duplicate email
    existing_user = await db.get_user_by_email(body.email)
    if existing_user:
        raise HTTPException(status_code=409, detail="Email already registered")

    uid = str(uuid.uuid4())
    await db.add_user({
        "id": uid,
        "name": body.name,
        "email": body.email,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    token = create_access_token(uid)
    return TokenResponse(
        access_token=token,
        user=UserOut(id=uid, name=body.name, email=body.email),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: FileDB = Depends(get_db)):
    user = await db.get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user["id"])
    return TokenResponse(
        access_token=token,
        user=UserOut(id=user["id"], name=user["name"], email=user["email"]),
    )
