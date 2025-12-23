import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

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
import os
from google.cloud.firestore import Client as FirestoreClient
from datetime import datetime
from google.oauth2 import service_account
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import firebase_admin
from firebase_admin import credentials

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

# Initialize Firestore
db_firestore = None
try:
    # Get Firebase service account path from environment variable
    service_account_path = os.getenv("FIREBASE_KEY_PATH", os.path.join(os.path.dirname(__file__), "talkbuddy-ai-f7d6a-firebase-adminsdk-fbsvc-f8e7032147.json"))
        
    if os.path.exists(service_account_path):
        # Load the service account credentials
        with open(service_account_path, 'r') as f:
            import json
            service_account_info = json.load(f)
            project_id = service_account_info.get('project_id')
        
        # Create credentials with a shorter refresh interval to avoid JWT issues
        try:
            from google.oauth2 import service_account
            from google.cloud import firestore
            
            credentials = service_account.Credentials.from_service_account_file(
                service_account_path,
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            db_firestore = firestore.Client(credentials=credentials, project=project_id)
            logger.info(f"Firestore initialized successfully for project {project_id}")
        except Exception as db_error:
            logger.error(f"Failed to initialize Firestore with service account: {db_error}")
            
            # Try with default credentials (if running in Google Cloud environment)
            try:
                db_firestore = firestore.Client()
                logger.info(f"Firestore initialized with default credentials")
            except Exception as fallback_error:
                logger.error(f"Failed to initialize Firestore with default credentials: {fallback_error}")
                db_firestore = None
    else:
        logger.warning(f"Service account file not found at {service_account_path}")
        
        # Try with default credentials
        try:
            from google.cloud import firestore
            db_firestore = firestore.Client()
            logger.info(f"Firestore initialized with default credentials")
        except Exception as e:
            logger.error(f"Failed to initialize Firestore: {e}")
            db_firestore = None
        
except Exception as e:
    logger.error(f"Failed to initialize Firestore: {e}")
    db_firestore = None

# Initialize Firebase Admin SDK
firebase_admin_app = None
try:
    if not firebase_admin._apps:
        if os.path.exists(service_account_path):
            # Use the credentials file to initialize Firebase Admin SDK
            cred = credentials.Certificate(service_account_path)
            firebase_admin_app = firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully")
        else:
            logger.warning(f"Service account file not found at {service_account_path}, skipping Firebase Admin SDK initialization")
    else:
        # Use the existing app if already initialized
        firebase_admin_app = list(firebase_admin._apps.values())[0]  # Get first app from values
        logger.info("Firebase Admin SDK already initialized")
except Exception as e:
    logger.error(f"Failed to initialize Firebase Admin SDK: {e}")
    # Don't raise an exception, just log it since we can still use Firestore
    # The auth deletion is optional - Firestore deletion will still work
    firebase_admin_app = None  # Explicitly set to None to avoid issues

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

class GenerateAssessmentRequest(BaseModel):
    user_id: str

class QuizSubmissionRequest(BaseModel):
    user_id: str
    quiz_id: str
    responses: List[Dict[str, Any]]
    scores: List[Dict[str, Any]]  # For oral questions: {questionId, score, feedback, etc}
    total_score: float
    percentage: float

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


# ==================== AI QUIZ GENERATION ====================

async def get_user_assessment_level(user_id: str) -> str:
    """Fetch user's assessment level from Firestore using document ID."""
    if not db_firestore:
        logger.warning("Firestore not available, defaulting to BASIC")
        return "BASIC"
    
    try:
        # Use document ID directly (user_id is the document ID)
        user_ref = db_firestore.collection("users").document(user_id)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            user_data = user_doc.to_dict()
            level = user_data.get("assessmentLevel", "BASIC")
            # Normalize to uppercase
            level = level.upper() if level else "BASIC"
            if level not in ["BASIC", "INTERMEDIATE", "ADVANCED"]:
                level = "BASIC"
            logger.info(f"User {user_id} assessment level: {level}")
            return level
        else:
            logger.warning(f"User {user_id} not found in Firestore, defaulting to BASIC")
            return "BASIC"
    except Exception as e:
        error_msg = str(e)
        # Check if it's a database not found error
        if "does not exist" in error_msg or "404" in error_msg:
            logger.error(f"Firestore database not found. Please ensure Firestore is set up in your Google Cloud project. Error: {e}")
        else:
            logger.error(f"Error fetching user level: {e}")
        return "BASIC"


def get_quiz_generation_prompt(level: str) -> str:
    """Generate prompt for quiz generation based on level."""
    level_lower = level.lower()
    
    if level == "BASIC":
        return """You are an expert English language teacher creating a quiz for a BASIC level learner (beginner). 

Create engaging, practical questions that test real understanding, not just memorization. Make questions relevant to everyday situations.

QUIZ REQUIREMENTS:
- 3 multiple-choice questions covering: present simple tense, basic articles (a/an/the), common verbs (be, have, do, go), simple prepositions (in, on, at), and basic vocabulary
- 5 oral/speaking questions that are conversational and easy to answer with personal experience
- All questions must be clear, unambiguous, and use simple vocabulary
- Multiple-choice questions should have ONE clearly correct answer and 3 plausible distractors
- Oral questions should encourage personal responses and be 1-2 sentences maximum
- Vary topics: daily routines, family, hobbies, food, weather, simple descriptions

QUALITY GUIDELINES:
- Use real-world contexts (e.g., "I ___ to work every day" not abstract grammar)
- Make questions practical and relatable
- Ensure oral questions can be answered with 2-3 simple sentences
- Avoid trick questions or overly complex sentence structures
- Test one concept per question clearly

Return ONLY a valid JSON array in this exact format:
[
  {
    "id": "q1",
    "type": "multiple_choice",
    "question": "What is the correct form?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": "Option A"
  },
  {
    "id": "q2",
    "type": "oral",
    "question": "Tell me about your favorite food."
  }
]

Generate exactly 3 multiple-choice and 5 oral questions. Return only the JSON array, no other text."""
    
    elif level == "INTERMEDIATE":
        return """You are an expert English language teacher creating a quiz for an INTERMEDIATE level learner.

Create thought-provoking questions that test grammar accuracy, vocabulary usage, and ability to express ideas clearly. Questions should challenge learners while remaining achievable.

QUIZ REQUIREMENTS:
- 3 multiple-choice questions covering: past simple vs present perfect, past perfect, first/second conditionals, phrasal verbs (common ones like "give up", "look after", "turn down"), passive voice, and relative clauses
- 5 oral/speaking questions that require expressing opinions, describing experiences, or explaining concepts
- Questions should use varied sentence structures and natural, conversational language
- Multiple-choice questions should test understanding of subtle grammar differences, not just memorization
- Oral questions should be 2-3 sentences and encourage responses of 3-5 sentences
- Vary topics: experiences, opinions, hypothetical situations, comparisons, advice

QUALITY GUIDELINES:
- Use authentic contexts that intermediate learners encounter (work, travel, relationships, goals)
- Test ability to choose correct tense based on context and meaning
- Make distractors plausible but clearly incorrect
- Oral questions should require connecting ideas and using appropriate grammar structures
- Encourage critical thinking and personal expression
- Avoid overly formal or academic language unless testing formal register

Return ONLY a valid JSON array in this exact format:
[
  {
    "id": "q1",
    "type": "multiple_choice",
    "question": "What is the correct form?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": "Option A"
  },
  {
    "id": "q2",
    "type": "oral",
    "question": "Describe a memorable trip you took recently. What made it special?"
  }
]

Generate exactly 3 multiple-choice and 5 oral questions. Return only the JSON array, no other text."""
    
    else:  # ADVANCED
        return """You are an expert English language teacher creating a quiz for an ADVANCED level learner.

Create sophisticated questions that test mastery of nuanced grammar, precise vocabulary, and ability to articulate complex ideas. Questions should reflect native-level proficiency expectations.

QUIZ REQUIREMENTS:
- 3 multiple-choice questions covering: third conditionals, mixed conditionals, subjunctive mood, advanced phrasal verbs, complex prepositions, collocations, advanced idioms, formal vs informal register, and subtle grammar distinctions
- 5 oral/speaking questions that require analytical thinking, argumentation, or sophisticated expression
- Questions should demonstrate understanding of register, tone, and stylistic choices
- Multiple-choice questions should test subtle differences between correct and near-correct options
- Oral questions should be 3-4 sentences and require well-structured, thoughtful responses (5+ sentences)
- Vary topics: abstract concepts, social issues, professional scenarios, cultural analysis, hypothetical complex situations

QUALITY GUIDELINES:
- Use sophisticated vocabulary and complex sentence structures naturally
- Test understanding of when to use formal vs informal language
- Include questions that require distinguishing between similar advanced structures
- Oral questions should prompt nuanced opinions, analysis, or sophisticated explanations
- Make distractors very close to correct but clearly wrong upon careful consideration
- Test ability to use language precisely and appropriately for context
- Encourage articulate, well-reasoned responses that demonstrate language mastery

Return ONLY a valid JSON array in this exact format:
[
  {
    "id": "q1",
    "type": "multiple_choice",
    "question": "What is the correct form?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": "Option A"
  },
  {
    "id": "q2",
    "type": "oral",
    "question": "Discuss the impact of technology on modern communication. How has it changed the way we interact, and what are the potential drawbacks of this evolution?"
  }
]

Generate exactly 3 multiple-choice and 5 oral questions. Return only the JSON array, no other text."""


@app.post("/generate_assessment/")
async def generate_assessment(request: GenerateAssessmentRequest):
    """Generate an AI-powered quiz based on user's assessment level."""
    try:
        if not db_firestore:
            raise HTTPException(
                status_code=503,
                detail="Database service unavailable"
            )
        
        # Get user's assessment level
        assessment_level = await get_user_assessment_level(request.user_id)
        logger.info(f"Generating quiz for user {request.user_id} at {assessment_level} level")
        
        # Generate quiz using AI
        prompt = get_quiz_generation_prompt(assessment_level)
        
        llm = await OllamaService.get_model()
        if not llm:
            raise HTTPException(
                status_code=503,
                detail="AI service is currently unavailable"
            )
        
        messages = [[HumanMessage(content=prompt)]]
        response = await llm.agenerate(messages)
        quiz_text = response.generations[0][0].text
        
        # Extract JSON from response
        json_match = re.search(r'\[[\s\S]*\]', quiz_text)
        if not json_match:
            raise ValueError("No valid JSON array found in AI response")
        
        quiz_json = json_match.group(0)
        questions = json.loads(quiz_json)
        
        # Validate questions structure
        if not isinstance(questions, list) or len(questions) < 5:
            raise ValueError("Invalid quiz format: expected at least 5 questions")
        
        # Create quiz document
        quiz_id = f"quiz_{int(time.time() * 1000)}"
        timestamp = datetime.utcnow()
        
        quiz_data = {
            "quiz_id": quiz_id,
            "user_id": request.user_id,
            "assessment_level": assessment_level,
            "questions": questions,
            "created_at": timestamp,
            "attempted": False,
            "total_questions": len(questions),
            "mc_questions": len([q for q in questions if q.get("type") == "multiple_choice"]),
            "oral_questions": len([q for q in questions if q.get("type") == "oral"])
        }
        
        # Save to Firestore: users/{uid}/ai_quizzes/{quiz_id}
        quiz_ref = db_firestore.collection("users").document(request.user_id).collection("ai_quizzes").document(quiz_id)
        quiz_ref.set(quiz_data)
        
        logger.info(f"Quiz {quiz_id} generated and saved for user {request.user_id}")
        
        return {
            "success": True,
            "quiz_id": quiz_id,
            "questions": questions,
            "assessment_level": assessment_level,
            "created_at": timestamp.isoformat()
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to parse AI-generated quiz. Please try again."
        )
    except Exception as e:
        logger.error(f"Error generating assessment: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate assessment: {str(e)}"
        )


@app.post("/submit_quiz/")
async def submit_quiz(request: QuizSubmissionRequest):
    """Submit quiz results and check for level promotion."""
    try:
        if not db_firestore:
            raise HTTPException(
                status_code=503,
                detail="Database service unavailable"
            )
        
        # Get current user level
        current_level = await get_user_assessment_level(request.user_id)
        
        # Update quiz document with results
        quiz_ref = db_firestore.collection("users").document(request.user_id).collection("ai_quizzes").document(request.quiz_id)
        quiz_doc = quiz_ref.get()
        
        if not quiz_doc.exists:
            raise HTTPException(status_code=404, detail="Quiz not found")
        
        quiz_data = quiz_doc.to_dict()
        quiz_level = quiz_data.get("assessment_level", "BASIC")
        
        # Save submission results
        submission_data = {
            "attempted": True,
            "attempted_at": datetime.utcnow(),
            "responses": request.responses,
            "scores": request.scores,
            "total_score": request.total_score,
            "percentage": request.percentage
        }
        
        quiz_ref.update(submission_data)
        
        # Check for level promotion
        promoted = False
        new_level = current_level
        
        # Only check promotion if quiz level matches current level
        if quiz_level == current_level:
            # Get recent quiz attempts at current level
            quizzes_ref = db_firestore.collection("users").document(request.user_id).collection("ai_quizzes")
            recent_quizzes = quizzes_ref.where("assessment_level", "==", current_level).where("attempted", "==", True).limit(10).get()
            
            high_scores = 0
            for q in recent_quizzes:
                q_data = q.to_dict()
                if q_data.get("percentage", 0) >= 75:  # 75% threshold
                    high_scores += 1
            
            # If user scored >=75% more than 2 times, promote
            if high_scores >= 3:  # 3 times (current + 2 previous)
                if current_level == "BASIC":
                    new_level = "INTERMEDIATE"
                    promoted = True
                elif current_level == "INTERMEDIATE":
                    new_level = "ADVANCED"
                    promoted = True
                
                if promoted:
                    # Update user document
                    user_ref = db_firestore.collection("users").document(request.user_id)
                    user_ref.update({
                        "assessmentLevel": new_level,
                        "levelPromotedAt": datetime.utcnow(),
                        "levelPromotedFrom": current_level
                    })
                    logger.info(f"User {request.user_id} promoted from {current_level} to {new_level}")
        
        # Get user email and display name for sending results email
        try:
            user_ref = db_firestore.collection("users").document(request.user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                user_email = user_data.get("email", "")
                display_name = user_data.get("displayName", "User")
                
                # Prepare quiz results data for email
                quiz_results = {
                    "percentage": request.percentage,
                    "total_score": request.total_score,
                    "max_score": request.total_score / (request.percentage / 100) if request.percentage > 0 else 0,
                    "total_questions": len(request.responses),
                    "promoted": promoted,
                    "new_level": new_level if promoted else None,
                    "assessment_level": current_level
                }
                
                # Send quiz results email asynchronously
                if user_email:
                    # Send email in background without blocking the response
                    send_quiz_results_email(user_email, display_name, quiz_results)
        except Exception as email_error:
            logger.warning(f"Could not send quiz results email: {str(email_error)}")
            # Don't raise an exception, just log it - email sending is not critical to quiz submission
        
        return {
            "success": True,
            "promoted": promoted,
            "new_level": new_level if promoted else current_level,
            "percentage": request.percentage
        }
        
    except Exception as e:
        logger.error(f"Error submitting quiz: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to submit quiz: {str(e)}"
        )

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

class DeletionEmailRequest(BaseModel):
    userId: str
    email: str
    displayName: str
    deletionToken: str
    confirmationUrl: str

@app.post("/send-deletion-email")
async def send_deletion_email_endpoint(request: DeletionEmailRequest):
    """Send account deletion confirmation email to user."""
    try:
        success = send_deletion_email(
            email=request.email,
            display_name=request.displayName,
            confirmation_url=request.confirmationUrl
        )
        
        if success:
            return {"success": True, "message": "Deletion confirmation email sent successfully"}
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to send deletion confirmation email"
            )
    except Exception as e:
        logger.error(f"Error in send_deletion_email_endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send deletion confirmation email: {str(e)}"
        )

@app.get("/confirm-deletion")
async def get_confirm_deletion(request: Request):
    """Return a simple response for the GET request to the confirmation page."""
    return {"message": "Deletion confirmation endpoint ready", "status": "ok"}

@app.post("/confirm-deletion")
async def confirm_account_deletion(request: Request):
    """Confirm and process account deletion after email verification."""
    try:
        # Get token from query parameters
        token = request.query_params.get('token')
        uid = request.query_params.get('uid')
        
        if not token or not uid:
            raise HTTPException(
                status_code=400,
                detail="Missing token or user ID"
            )
        
        # Verify the deletion request in Firestore
        if not db_firestore:
            raise HTTPException(
                status_code=503,
                detail="Database service unavailable"
            )
        
        deletion_request_ref = db_firestore.collection("deletionRequests").document(uid)
        deletion_request_doc = deletion_request_ref.get()
        
        if not deletion_request_doc.exists:
            raise HTTPException(
                status_code=404,
                detail="Deletion request not found"
            )
        
        deletion_data = deletion_request_doc.to_dict()
        
        # Verify the token
        if deletion_data.get("deletionToken") != token:
            raise HTTPException(
                status_code=400,
                detail="Invalid deletion token"
            )
        
        # Check if the request is still valid (not expired)
        requested_at = deletion_data.get("requestedAt")
        if requested_at:
            # Check if the request is older than 24 hours (86400000 ms)
            if time.time() * 1000 - requested_at > 24 * 60 * 60 * 1000:
                # Delete the expired request
                deletion_request_ref.delete()
                raise HTTPException(
                    status_code=400,
                    detail="Deletion request has expired"
                )
        
        # Mark the request as confirmed
        deletion_request_ref.update({
            "status": "confirmed",
            "confirmedAt": time.time() * 1000
        })
        
        # Actually delete the user account and all associated data
        success = await delete_user_account(uid)
        
        if success:
            return {
                "success": True,
                "message": "Account and all associated data have been successfully deleted.",
                "userId": uid
            }
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to delete user account"
            )
        
    except Exception as e:
        logger.error(f"Error in confirm_account_deletion: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to confirm account deletion: {str(e)}"
        )

def send_deletion_email(email: str, display_name: str, confirmation_url: str) -> bool:
    """Send account deletion confirmation email to user."""
    try:
        # Get email settings from environment variables
        sender_email = os.getenv("EMAIL_USER", "talkbuddyai@gmail.com")
        sender_password = os.getenv("EMAIL_PASSWORD")
        
        # Check if required environment variables are set
        if not sender_password:
            logger.error("EMAIL_PASSWORD not set in environment")
            return False
            
        if not sender_email:
            logger.error("EMAIL_USER not set in environment")
            return False
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = email
        msg['Subject'] = "Confirm Account Deletion - TalkBuddy AI"
        
        # Email body
        body = f"""
        Hello {display_name},
        
        You have requested to delete your TalkBuddy AI account. This is a permanent action that cannot be undone.
        
        To confirm account deletion, please click the link below:
        {confirmation_url}
        
        If you did not request this deletion, please ignore this email or contact our support team immediately.
        
        This link will expire in 24 hours for security reasons.
        
        Best regards,
        TalkBuddy AI Team
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        # Connect to server and send email
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(sender_email, sender_password)
        text = msg.as_string()
        server.sendmail(sender_email, email, text)
        server.quit()
        
        logger.info(f"Deletion confirmation email sent to {email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send deletion email: {str(e)}")
        return False

def send_quiz_results_email(email: str, display_name: str, quiz_results: Dict[str, Any]) -> bool:
    """Send quiz results email to user."""
    try:
        # Get email settings from environment variables
        sender_email = os.getenv("EMAIL_USER", "talkbuddyai@gmail.com")
        sender_password = os.getenv("EMAIL_PASSWORD")
        
        # Check if required environment variables are set
        if not sender_password:
            logger.error("EMAIL_PASSWORD not set in environment")
            return False
            
        if not sender_email:
            logger.error("EMAIL_USER not set in environment")
            return False
        
        # Create message
        msg = MIMEMultipart('alternative')
        msg['From'] = sender_email
        msg['To'] = email
        msg['Subject'] = "Your Quiz Results - TalkBuddy AI"
        
        # Extract quiz data
        percentage = quiz_results.get('percentage', 0)
        total_score = quiz_results.get('total_score', 0)
        max_score = quiz_results.get('max_score', 0)
        total_questions = quiz_results.get('total_questions', 0)
        promoted = quiz_results.get('promoted', False)
        new_level = quiz_results.get('new_level', '')
        assessment_level = quiz_results.get('assessment_level', 'BASIC')
        
        # Determine performance message
        if percentage >= 80:
            performance = "Excellent! 🌟"
        elif percentage >= 60:
            performance = "Good! 👍"
        elif percentage >= 40:
            performance = "Keep practicing! 💪"
        else:
            performance = "Don't give up! You can do better! 🚀"
        
        # Plain text version
        text_body = f"""
Hello {display_name},

Your quiz has been completed! Here are your results:

QUIZ RESULTS
============
Level: {assessment_level}
Performance: {performance}
Score: {percentage}% ({total_score}/{max_score} points)
Questions Answered: {total_questions}

"""
        
        if promoted:
            text_body += f"""LEVEL PROMOTION! 🎉
Congratulations! You've been promoted to {new_level} level!

"""
        
        text_body += """Keep practicing to improve your English skills!

Best regards,
TalkBuddy AI Team
        """
        
        # HTML version
        html_body = f"""
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #4CAF50; margin: 0;">🎯 Quiz Results</h1>
        <p style="color: #666; margin-top: 5px;">Your performance on TalkBuddy AI</p>
      </div>
      
      <div style="background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin-top: 0;">Hello {display_name},</h2>
        <p>Your quiz has been completed! Here are your results:</p>
        
        <div style="background-color: #f0f7ff; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Assessment Level:</strong> {assessment_level}</p>
          <p style="margin: 5px 0;"><strong>Performance:</strong> {performance}</p>
          <p style="margin: 5px 0;"><strong>Score:</strong> <span style="font-size: 24px; font-weight: bold; color: #4CAF50;">{percentage}%</span></p>
          <p style="margin: 5px 0;"><strong>Points Earned:</strong> {total_score}/{max_score}</p>
          <p style="margin: 5px 0;"><strong>Questions Answered:</strong> {total_questions}</p>
        </div>
        
        {f'<div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;"><h3 style="color: #856404; margin: 0;">🎉 Congratulations!</h3><p style="margin: 10px 0; color: #856404;">You\'ve been promoted to <strong>{new_level}</strong> level!</p></div>' if promoted else ''}
        
        <p style="margin-top: 20px; color: #666;">Keep practicing to improve your English skills!</p>
        
        <p style="margin-top: 20px; text-align: center; color: #999; font-size: 12px;">
          © 2025 TalkBuddy AI. All rights reserved.
        </p>
      </div>
    </div>
  </body>
</html>
        """
        
        # Attach both plain text and HTML versions
        msg.attach(MIMEText(text_body, 'plain'))
        msg.attach(MIMEText(html_body, 'html'))
        
        # Connect to server and send email
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(sender_email, sender_password)
        text = msg.as_string()
        server.sendmail(sender_email, email, text)
        server.quit()
        
        logger.info(f"Quiz results email sent to {email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send quiz results email: {str(e)}")
        return False

async def delete_user_account(uid: str) -> bool:
    """Delete user account and all associated data from Firestore and Firebase Auth."""
    try:
        if not db_firestore:
            logger.error("Firestore not available")
            return False
        
        # Load service account info for fresh client creation
        service_account_path = os.getenv("FIREBASE_KEY_PATH", os.path.join(os.path.dirname(__file__), "talkbuddy-ai-f7d6a-firebase-adminsdk-fbsvc-f8e7032147.json"))
        service_account_info = None
        if os.path.exists(service_account_path):
            with open(service_account_path, 'r') as f:
                import json
                service_account_info = json.load(f)
        
        # Execute with timeout using a separate thread to avoid blocking
        import concurrent.futures
        import threading
        
        def execute_with_timeout(func, timeout_seconds=10):
            result = [None]
            exception = [None]
            
            def target():
                try:
                    result[0] = func()
                except Exception as e:
                    exception[0] = e
            
            thread = threading.Thread(target=target)
            thread.daemon = True
            thread.start()
            thread.join(timeout_seconds)
            
            if thread.is_alive():
                logger.warning(f"Operation timed out after {timeout_seconds} seconds")
                return False, "timeout"
            
            if exception[0]:
                raise exception[0]
            
            return result[0], "success"
        
        # Get user data before deletion to access email
        try:
            user_ref = db_firestore.collection("users").document(uid)
            user_doc = user_ref.get()
        except Exception as e:
            logger.error(f"Error accessing user document for deletion {uid}: {str(e)}")
            return False
        
        if user_doc.exists:
            user_data = user_doc.to_dict()
            user_email = user_data.get("email", "")
            
            # Delete user's subcollections (like ai_quizzes)
            try:
                ai_quizzes_ref = user_ref.collection("ai_quizzes")
                quizzes_docs = ai_quizzes_ref.get()
                for quiz_doc in quizzes_docs:
                    quiz_doc.reference.delete()
            except Exception as quiz_error:
                logger.warning(f"Could not delete ai_quizzes for user {uid}: {str(quiz_error)}")
            
            # Delete the main user document
            try:
                user_ref.delete()
            except Exception as user_error:
                logger.warning(f"Could not delete main user document {uid}: {str(user_error)}")
                # If we can't delete the main document, return False
                return False
            
            # Delete from registeredEmails if exists
            if user_email:
                try:
                    email_key = user_email.lower().strip()
                    registered_email_ref = db_firestore.collection("registeredEmails").document(email_key)
                    registered_email_ref.delete()
                except Exception as email_error:
                    logger.warning(f"Could not delete registered email for user {uid}: {str(email_error)}")
            
            # Delete any deletion requests for this user
            try:
                deletion_request_ref = db_firestore.collection("deletionRequests").document(uid)
                deletion_request_ref.delete()
            except Exception as deletion_error:
                logger.warning(f"Could not delete deletion request for user {uid}: {str(deletion_error)}")
            
            # Delete user's voice sessions - with specific error handling for JWT issues
            try:
                from google.cloud.firestore import Query
                voice_sessions_query = db_firestore.collection("voice_sessions").where("userId", "==", uid).limit(1000)  # Limit to avoid timeout
                voice_sessions_docs = voice_sessions_query.get()
                for session_doc in voice_sessions_docs:
                    session_doc.reference.delete()
                logger.info(f"Deleted voice sessions for user {uid}")
            except Exception as voice_error:
                # Check if this is an authentication/JWT error
                error_str = str(voice_error).lower()
                if "invalid_grant" in error_str or "jwt" in error_str or "auth" in error_str:
                    logger.warning(f"Authentication error deleting voice sessions for user {uid}, skipping: {str(voice_error)}")
                else:
                    logger.warning(f"Could not delete voice sessions for user {uid}: {str(voice_error)}")
            
            # Delete user's guided sessions - with specific error handling for JWT issues
            try:
                guided_sessions_query = db_firestore.collection("guidedSessions").where("userId", "==", uid).limit(1000)  # Limit to avoid timeout
                guided_sessions_docs = guided_sessions_query.get()
                for session_doc in guided_sessions_docs:
                    session_doc.reference.delete()
                logger.info(f"Deleted guided sessions for user {uid}")
            except Exception as guided_error:
                # Check if this is an authentication/JWT error
                error_str = str(guided_error).lower()
                if "invalid_grant" in error_str or "jwt" in error_str or "auth" in error_str:
                    logger.warning(f"Authentication error deleting guided sessions for user {uid}, skipping: {str(guided_error)}")
                else:
                    logger.warning(f"Could not delete guided sessions for user {uid}: {str(guided_error)}")
            
            # Try to delete Firebase Auth user (this will work for both email/password and Google users)
            try:
                if firebase_admin_app:  # Only try if Firebase Admin SDK was initialized successfully
                    from firebase_admin import auth
                    auth.delete_user(uid)
                    logger.info(f"Firebase Auth user {uid} deleted successfully")
                else:
                    logger.warning(f"Firebase Admin SDK not initialized, skipping auth deletion for user {uid}")
            except Exception as auth_error:
                logger.warning(f"Could not delete Firebase Auth user {uid}: {str(auth_error)}")
                # Continue with deletion even if Firebase Auth deletion fails
            
            logger.info(f"User account {uid} and all associated data deleted successfully")
            return True
        else:
            logger.warning(f"User document not found for deletion: {uid}")
            return False
            
    except Exception as e:
        logger.error(f"Error deleting user account {uid}: {str(e)}")
        return False

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )