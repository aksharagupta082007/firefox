"""
AURORA TECH — RBAC Middleware
Ensures only authorized users can access specific operational interfaces.
"""
from fastapi import Request, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from backend.auth.jwt_handler import decode_access_token, TokenData
from typing import List

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)) -> TokenData:
    token_data = decode_access_token(token)
    if not token_data:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token_data

class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: TokenData = Depends(get_current_user)):
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user.role}' does not have access to this resource. Allowed: {self.allowed_roles}"
            )
        return user

# Pre-defined role dependencies
is_admin = RoleChecker(["admin"])
is_responder = RoleChecker(["admin", "responder"])
is_citizen = RoleChecker(["admin", "responder", "citizen"])
