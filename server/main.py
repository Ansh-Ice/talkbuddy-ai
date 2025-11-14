from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
import ollama
import json

# Optional Firestore import — only needed if you want backend logging later
try:
    from google.cloud import firestore
    db = firestore.Client()
except ImportError:
    db = None
    print("⚠️ Firestore not configured — skipping DB operations")

app = FastAPI()

# -------------------- Middleware --------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict later to frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------- Models --------------------
class Answer(BaseModel):
    answer: str
    question_text: str = None
    skill_tested: str = None
    type: str = None

class AssessmentRequest(BaseModel):
    user_id: str
    level: str
    focus: str
    type: str = "custom"

class AssessmentSubmission(BaseModel):
    user_id: str
    assessment_id: str
    responses: list  # [{"question": "...", "answer": "..."}]


# -------------------- 1️⃣ Evaluate Answer --------------------
@app.post("/evaluate_answer/")
async def evaluate_answer(ans: Answer):
    """
    Evaluates a student's answer using Gemma 2B.
    Returns JSON with score and short feedback.
    """

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

    try:
        response = ollama.chat(
            model="gemma:2b",
            messages=[{"role": "user", "content": prompt}]
        )
        ai_result = json.loads(response["message"]["content"])
    except Exception:
        ai_result = {"score": 0, "feedback": "Could not evaluate"}

    return ai_result


# -------------------- 2️⃣ Generate Assessment --------------------
@app.post("/generate_assessment/")
async def generate_assessment(request: AssessmentRequest):
    """
    Generates 10 AI-based multiple-choice questions dynamically using Gemma 2B.
    Returns the question list directly; frontend handles Firestore write.
    """

    # Weekly generation guard (optional — remove if frontend handles)
    if db and request.type == "weekly":
        query = (
            db.collection("assessments")
            .where("user_id", "==", request.user_id)
            .where("type", "==", "weekly")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(1)
        )
        for doc in query.stream():
            last = doc.to_dict().get("created_at")
            if datetime.utcnow() - last.replace(tzinfo=None) < timedelta(days=7):
                return {"message": "Weekly assessment already exists", "data": doc.to_dict()}

    # Prompt for Gemma model
    prompt = f"""
    You are an English communication coach.
    Generate 10 multiple-choice questions for an English assessment.
    Level: {request.level}
    Focus: {request.focus}
    Each question must be valid JSON with this structure:
    {{
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correct": "...",
      "explanation": "..."
    }}
    Return only a JSON list of 10 questions.
    """

    try:
        response = ollama.chat(
            model="gemma:2b",
            messages=[{"role": "user", "content": prompt}]
        )
        raw = response["message"]["content"]

        try:
            questions = json.loads(raw)
        except json.JSONDecodeError:
            start, end = raw.find("["), raw.rfind("]") + 1
            questions = json.loads(raw[start:end])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

    return {"message": "Assessment generated successfully", "questions": questions}


# -------------------- 3️⃣ Submit Assessment --------------------
@app.post("/submit_assessment/")
async def submit_assessment(submission: AssessmentSubmission):
    """
    Evaluates user's submitted answers, scores them,
    and returns AI-generated feedback for each.
    """

    # No Firestore fetch — assumes frontend passes the correct assessment data
    total = len(submission.responses)
    correct = 0
    detailed_feedback = []

    for resp in submission.responses:
        question = resp.get("question")
        given_answer = resp.get("answer")
        correct_answer = resp.get("correct")

        is_correct = (
            given_answer.strip().lower() == str(correct_answer).strip().lower()
            if correct_answer else False
        )
        correct += 1 if is_correct else 0

        # Generate friendly feedback
        feedback_prompt = f"""
        You are an evaluator.
        Question: "{question}"
        Student Answer: "{given_answer}"
        Correct Answer: "{correct_answer}"
        Task: Give a short feedback message (1 line).
        Respond in JSON: {{"feedback": "<short message>"}}
        """
        try:
            feedback_resp = ollama.chat(
                model="gemma:2b",
                messages=[{"role": "user", "content": feedback_prompt}]
            )
            feedback_json = json.loads(feedback_resp["message"]["content"])
        except Exception:
            feedback_json = {"feedback": "Feedback unavailable"}

        detailed_feedback.append({
            "question": question,
            "given_answer": given_answer,
            "correct_answer": correct_answer,
            "is_correct": is_correct,
            "ai_feedback": feedback_json["feedback"]
        })

    percentage = round((correct / total) * 100, 2) if total > 0 else 0

    result = {
        "score": correct,
        "total": total,
        "percentage": percentage,
        "feedback": detailed_feedback,
        "submitted_at": datetime.utcnow(),
    }

    # Optional Firestore update (you can skip)
    if db:
        db.collection("assessment_results").add({
            "user_id": submission.user_id,
            "assessment_id": submission.assessment_id,
            "result": result,
            "created_at": datetime.utcnow()
        })

    return {"message": "Assessment submitted successfully", "data": result}


# -------------------- 4️⃣ Latest Assessment --------------------
@app.get("/latest_assessment/{user_id}")
async def latest_assessment(user_id: str):
    """
    Returns the latest assessment document for the given user.
    Works only if Firestore is configured.
    """
    if not db:
        raise HTTPException(status_code=501, detail="Firestore not configured in backend")

    docs = (
        db.collection("assessments")
        .where("user_id", "==", user_id)
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(1)
        .stream()
    )
    for doc in docs:
        return {"data": doc.to_dict(), "id": doc.id}
    raise HTTPException(status_code=404, detail="No assessments found")
