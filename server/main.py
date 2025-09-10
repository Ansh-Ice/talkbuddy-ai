from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from pydantic import BaseModel
import ollama, json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # you can restrict later, e.g. ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Answer(BaseModel):
    answer: str

@app.post("/evaluate_answer/")
async def evaluate_answer(ans: Answer):
    prompt = f"""
    You are an evaluator.
    Student Answer: "{ans.answer}"
    Task: Give a score between 0–10 and short feedback.
    Respond ONLY in JSON:
    {{
      "score": <number>,
      "feedback": "<short comment>"
    }}
    """

    response = ollama.chat(
        model="gemma:2b",
        messages=[{"role": "user", "content": prompt}]
    )

    try:
        ai_result = json.loads(response["message"]["content"])
    except:
        ai_result = {"score": 0, "feedback": "Could not evaluate"}

    return ai_result
