from fastapi import FastAPI

# Create FastAPI instance
app = FastAPI()

# Example route
@app.get("/")
def root():
    return {"message": "Hello from FastAPI 🚀"}
