from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Literal
from langchain_ollama import ChatOllama
from fastapi.responses import JSONResponse
from langchain_core.messages import HumanMessage, SystemMessage
import json
import logging
import asyncio
import time
import aiohttp
from functools import lru_cache
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('talkbuddy.log')
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TalkBuddy AI API",
    description="API for English language learning with voice interaction",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# VOICE_CHAT_PROMPT = """
# You are TalkBuddy, a friendly and encouraging English tutor.
# Your responses must always be short, natural, and conversational (2–3 sentences maximum).

# For every user message, you must:

# Understand the user’s message and intent.

# Gently include a corrected version of their sentence inside your reply, without labeling it.

# Add one small tip naturally in the flow.

# Keep the tone warm, supportive, and human-like.

# Focus on only one correction per response.

# Keep the conversation moving with a follow-up question.

# Do not use headings like “Correction:” or “Tip:”.
# Everything should feel like normal, friendly conversation.

# Example 1

# User: "i goes to park yesterday"
# You: "Oh, you went to the park yesterday? That sounds nice! We use ‘went’ for past actions. Did you go alone or with someone?"

# Example 2

# User: "what time the museum opens"
# You: "What time does the museum open? That’s a useful question—using ‘does’ makes it sound smoother. Are you planning to visit soon?"

# Voice Interaction Rules

# Responses must be clear and simple for speaking aloud.

# Avoid long explanations or grammar terms.

# Keep everything friendly and easy to follow.

# Your main goals:
# ✔ Make the learner feel confident
# ✔ Correct them naturally
# ✔ Give one small helpful hint
# ✔ Keep it short and conversational
# ✔ Encourage them to keep talking
# """
# System prompt for Llama
SYSTEM_PROMPT = """

You are TalkBuddy, an AI English tutor assessing a student's spoken response. Your task is to evaluate the response and provide feedback in a structured JSON format.

For EVERY assessment, follow these steps:
1. Analyze the student's response for:
   - Grammar accuracy
   - Vocabulary usage
   - Sentence structure
   - Clarity and coherence
   - Pronunciation (if audio is available)

2. Provide feedback in this EXACT JSON format:
{
  "score": 0-10,  // Overall score out of 10
  "feedback": "A short, encouraging feedback paragraph (3-4 lines). Start with something positive, then mention 1-2 areas for improvement, and end on a positive note.",
  "corrections": [
    {
      "original": "original text with error",
      "corrected": "corrected version",
      "explanation": "brief explanation of the correction"
    }
  ],
  "suggestions": [
    "One specific suggestion for improvement",
    "Another specific suggestion"
  ],
  "encouragement": "A positive, motivating closing statement"
}

IMPORTANT RULES:
1. ALWAYS respond with valid JSON that matches the exact structure above
2. If no corrections are needed, return an empty array for 'corrections'
3. Keep feedback constructive and encouraging
4. Focus on 1-2 key areas for improvement
5. Always include a score between 0-10
6. If the response is completely unintelligible, provide a score of 1-3 and gentle guidance
7. If the response is perfect, give a 10 and praise the student

Example 1 (with corrections):
User: "I goes to park yesterday."
{
  "score": 6,
  "feedback": "Great attempt! You're doing well with basic sentence structure. I noticed a small verb tense issue - we use 'went' for past actions. Keep practicing those past tense verbs - you're making good progress!",
  "corrections": [
    {
      "original": "I goes to park yesterday",
      "corrected": "I went to the park yesterday",
      "explanation": "Use 'went' (past tense of 'go') for past actions, and add 'the' before 'park'"
    }
  ],
  "suggestions": [
    "Practice using simple past tense verbs like went, saw, ate, etc.",
    "Remember to use articles like 'a' or 'the' before nouns"
  ],
  "encouragement": "You're doing great! Keep practicing and you'll master past tense in no time!"
}

Example 2 (no corrections):
User: "I visited the museum last weekend."
{
  "score": 10,
  "feedback": "Excellent job! Your sentence is grammatically perfect. You used the past tense correctly and your sentence structure is spot on. This is exactly how a native speaker would say it!",
  "corrections": [],
  "suggestions": [
    "Try adding more details next time, like what you saw at the museum"
  ],
  "encouragement": "Keep up the fantastic work! Your English is improving every day!"
}

For voice interactions, make sure your response is clear and easy to understand when spoken aloud. Keep responses conversational and not too long - 2-3 sentences is ideal.

Remember:
- Be warm and encouraging
- Focus on 1-2 teaching points at a time
- Keep the conversation flowing naturally
- Avoid technical grammar terms unless asked
- Always respond in a way that invites further conversation
"""
# Models
class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    user_name: Optional[str] = None

class QuizEvaluationRequest(BaseModel):
    userId: str
    questionId: str
    userResponse: str
    questionText: str

class HealthCheckResponse(BaseModel):
    status: str
    ollama_available: bool
    timestamp: float

# Service to manage Ollama connections
class OllamaService:
    _instance = None
    _model = None
    _last_error = None
    _retry_after = 0

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._initialize_model()
        return cls._instance

    @classmethod
    def _initialize_model(cls):
        try:
            cls._model = ChatOllama(
                model="llama3.1",
                temperature=0.7,
                num_ctx=2048,
                timeout=120
            )
            cls._last_error = None
            logger.info("Ollama model initialized successfully")
        except Exception as e:
            cls._model = None
            cls._last_error = str(e)
            logger.error(f"Failed to initialize Ollama model: {e}")

    @classmethod
    async def get_model(cls):
        if cls._model is None or (cls._last_error and time.time() > cls._retry_after):
            cls._initialize_model()
        
        if cls._model is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI service is currently unavailable. Please try again later."
            )
        
        return cls._model

# Health check endpoint
@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """Check if the service is healthy and Ollama is available."""
    try:
        ollama_available = await check_ollama_running()
        return {
            "status": "healthy",
            "ollama_available": ollama_available,
            "timestamp": time.time()
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "ollama_available": False,
            "timestamp": time.time()
        }

async def check_ollama_running() -> bool:
    """Check if Ollama service is running and responding."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get('http://localhost:11434/api/tags', timeout=5) as response:
                return response.status == 200
    except Exception as e:
        logger.warning(f"Ollama check failed: {str(e)}")
        return False

@app.post("/voice_chat/")
async def voice_chat(request: ChatRequest):
    try:
        if not request.messages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No messages provided"
            )
        
        # Get the last user message
        last_user_message = next(
            (msg for msg in reversed(request.messages) if msg.role == "user"),
            None
        )
        
        if not last_user_message or not last_user_message.content.strip():
            return {
                "reply": "I didn't catch that. Could you please say that again?",
                "audio_text": "I didn't catch that. Could you please say that again?"
            }
        
        user_message = last_user_message.content.strip()
        logger.info(f"Processing message: {user_message[:100]}...")
        
        # Prepare a simple, direct prompt
        prompt = f"""
        You are TalkBuddy, a friendly English tutor. 
        Your responses must always be short (2–3 sentences) and focus mainly on improving the learner’s English.

        For every user message, you MUST:
        1. Give the corrected version of the user’s whole sentence, woven naturally into your reply (no labels).
        2. Continue the conversation with one short question.
        3. Never exceed 2–3 short sentences total.

        Avoid long explanations, grammar terms, or storytelling. Stay simple, friendly, and conversational.


        User said: "{user_message}
        """
        
        try:
            model = await OllamaService.get_model()
            if not model:
                raise Exception("Model not available")
            
            # Get response using the model's invoke method
            response = await model.ainvoke(prompt)
            
            # Extract the response text
            if hasattr(response, 'content'):
                reply = response.content
            elif hasattr(response, 'text'):
                reply = response.text
            else:
                reply = str(response)
            
            # Clean up the response
            reply = ' '.join(reply.split()).strip()
            reply = reply.replace('```', '').replace('**', '').strip()
            
            # Ensure we have a valid response
            if not reply or len(reply) < 2:
                reply = "I'm not sure how to respond to that. Could you try rephrasing?"
            
            logger.info(f"Generated response: {reply}")
            
            return {
                "reply": reply,
                "audio_text": reply
            }
            
        except Exception as e:
            logger.error(f"Error getting model response: {str(e)}", exc_info=True)
            return {
                "reply": "I'm having trouble responding right now. Could you try again in a moment?",
                "audio_text": "I'm having trouble responding right now. Could you try again in a moment?"
            }
            
    except Exception as e:
        logger.error(f"Unexpected error in voice chat: {str(e)}", exc_info=True)
        return {
            "reply": "I encountered an error. Let's try that again.",
            "audio_text": "I encountered an error. Let's try that again."
        }


# Quiz evaluation endpoint
@app.post("/api/oral-quiz/evaluate")
async def evaluate_oral_response(request: QuizEvaluationRequest):
    """Evaluate a user's spoken response to an oral quiz question."""

    from langchain_core.messages import HumanMessage
    import json, re

    if not request.userResponse.strip():
        return {
            "score": 0,
            "feedback": "No response was provided. Please try speaking again.",
            "suggestions": [
                "Make sure to speak clearly into the microphone",
                "Try to provide a complete sentence in your response"
            ]
        }

    # Build evaluation prompt
    evaluation_prompt = f"""
    You are an English language assessment AI. Please evaluate the following spoken response.

    QUESTION: {request.questionText}
    STUDENT RESPONSE: {request.userResponse}

    Respond ONLY with the JSON object in this exact format:

    {{
        "score": 7,
        "feedback": "Your feedback here.",
        "corrections": [
            {{
                "original": "text",
                "corrected": "text",
                "explanation": "why it is corrected"
            }}
        ],
        "suggestions": [
            "suggestion 1",
            "suggestion 2"
        ],
        "encouragement": "Closing motivational line."
    }}
    """

    max_retries = 3

    for attempt in range(max_retries):
        try:
            # Load Ollama model
            llm = await OllamaService.get_model()
            if not llm:
                raise HTTPException(
                    status_code=503,
                    detail="Ollama model is not available."
                )

            # FIXED: agenerate now requires message objects, NOT raw strings
            messages = [[HumanMessage(content=evaluation_prompt)]]

            response = await llm.agenerate(messages)

            # Extract model response
            evaluation_text = response.generations[0][0].text

            # Extract JSON segment
            json_match = re.search(r"\{[\s\S]*\}", evaluation_text)
            if not json_match:
                raise ValueError("No JSON found in model output.")

            clean_json = json_match.group(0)

            # Parse JSON
            evaluation = json.loads(clean_json)

            # Validate essential fields
            required_fields = ["score", "feedback", "suggestions"]
            if not all(field in evaluation for field in required_fields):
                raise ValueError("AI response missing required fields.")

            # Sanitize score (1–10)
            score = max(1, min(10, int(evaluation.get("score", 5))))

            return {
                "score": score,
                "feedback": evaluation.get("feedback", ""),
                "corrections": evaluation.get("corrections", []),
                "suggestions": evaluation.get("suggestions", [])[:3],
                "encouragement": evaluation.get("encouragement", "Great effort! Keep improving!")
            }

        except Exception as e:
            logger.error(f"Evaluation error (attempt {attempt + 1}): {str(e)}", exc_info=True)

            if attempt == max_retries - 1:
                # Final failure
                raise HTTPException(
                    status_code=503,
                    detail="Unable to evaluate your response right now. Please try again."
                )

            # Retry on next loop
            continue

    # Should never reach here
    raise HTTPException(status_code=500, detail="Unexpected evaluation failure.")

# Make sure to add this import at the top of your file
from fastapi.responses import JSONResponse

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred"},
    )
# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )