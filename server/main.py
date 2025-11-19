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
    
    service_account_path = os.path.join(os.path.dirname(__file__), "talkbuddy-ai-f7d6a-firebase-adminsdk-fbsvc-060787fb4e.json")
        
    if os.path.exists(service_account_path):
        cred = service_account.Credentials.from_service_account_file(service_account_path)
        # Use the project ID from credentials, or fallback to the one from the JSON
        project_id = cred.project_id
        
        # Try to initialize Firestore with explicit database parameter
        # For Firestore Native mode, use database='(default)'
        try:
            db_firestore = FirestoreClient(credentials=cred, project=project_id, database='(default)')
            logger.info(f"Firestore initialized successfully for project {project_id}")
        except Exception as db_error:
            # If database parameter fails, try without it (for older Firestore setups)
            logger.warning(f"Failed with database parameter, trying without: {db_error}")
            try:
                db_firestore = FirestoreClient(credentials=cred, project=project_id)
                logger.info(f"Firestore initialized successfully for project {project_id} (without database param)")
            except Exception as e2:
                logger.error(f"Failed to initialize Firestore: {e2}")
                db_firestore = None
    else:
        logger.warning(f"Service account file not found at {service_account_path}")
except Exception as e:
    logger.error(f"Failed to initialize Firestore: {e}")
    db_firestore = None

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )