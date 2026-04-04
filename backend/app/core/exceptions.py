"""Кастомные HTTP-исключения."""

from fastapi import HTTPException, status


class BadRequestException(HTTPException):
    """Некорректный запрос (400)."""

    def __init__(self, detail: str = "Некорректный запрос"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


class CredentialsException(HTTPException):
    """Невалидные учётные данные (401)."""

    def __init__(self, detail: str = "Невалидные учётные данные"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenException(HTTPException):
    """Доступ запрещён (403)."""

    def __init__(self, detail: str = "Доступ запрещён"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class NotFoundException(HTTPException):
    """Ресурс не найден (404)."""

    def __init__(self, detail: str = "Ресурс не найден"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class ConflictException(HTTPException):
    """Конфликт данных (409)."""

    def __init__(self, detail: str = "Ресурс уже существует"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)
