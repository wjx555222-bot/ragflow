import time
import traceback
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.logging import get_logger

logger = get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        duration = round((time.time() - start_time) * 1000, 2)
        logger.info(
            "%s %s %d %dms",
            request.method,
            request.url.path,
            response.status_code,
            duration,
        )
        return response


async def validation_error_handler(request: Request, exc: Exception):
    logger.warning("Validation error: %s", str(exc))
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": str(exc)},
    )


async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s\n%s", str(exc), traceback.format_exc())
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )
