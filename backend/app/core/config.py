from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./ragflow.db"
    secret_key: str = "change-me-to-a-random-secret-key-32chars"

    deepseek_api_key: str = "sk-your-deepseek-key"
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"

    embedding_model: str = "BAAI/bge-large-zh-v1.5"
    embedding_device: str = "cpu"
    embedding_dim: int = 1024

    chroma_persist_dir: str = "./chroma_data"
    chunk_size: int = 500
    chunk_overlap: int = 50
    retrieval_top_k: int = 5

    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 20

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
