# server/quiz_evaluator.py
from typing import Dict, Any, Optional
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
import logging
import asyncio
import re
from functools import wraps
import time

logger = logging.getLogger(__name__)

def retry_on_failure(max_retries=3, initial_delay=1, max_delay=10):
    """Decorator to retry a function on failure with exponential backoff."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            retries = 0
            delay = initial_delay
            
            while True:
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    retries += 1
                    if retries > max_retries:
                        logger.error(f"Max retries ({max_retries}) exceeded for {func.__name__}")
                        raise
                    
                    logger.warning(f"Attempt {retries} failed for {func.__name__}: {str(e)}. Retrying in {delay} seconds...")
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, max_delay)
        return wrapper
    return decorator

class QuizEvaluator:
    def __init__(self):
        self.model = ChatOllama(
            model="llama3.1",
            temperature=0.3,
            num_ctx=4096,
            timeout=60,  # Reduced timeout to fail faster
            max_retries=2,
            request_timeout=30
        )
        self.system_prompt = """
        You are an English language evaluation assistant. Your task is to evaluate spoken responses to English questions.
        
        Respond in the following JSON format:
        {
            "score": number (1-10),
            "correction": "corrected version of the response if needed, otherwise null",
            "feedback": "constructive feedback on the response",
            "suggestions": ["suggestion 1", "suggestion 2"],
            "is_appropriate": boolean
        }
        
        Evaluation criteria:
        1. Grammar accuracy (30%)
        2. Vocabulary usage (20%)
        3. Fluency and coherence (30%)
        4. Relevance to the question (20%)
        
        Keep feedback concise, constructive, and focused on improvement.
        """
        self.max_retries = 3
        self.request_timeout = 30  # seconds

    @retry_on_failure(max_retries=3)
    async def evaluate_response(self, question: str, response: str) -> Dict[str, Any]:
        """Evaluate a user's response with retry logic and timeout."""
        try:
            if not response.strip():
                raise ValueError("Empty response received")
                
            messages = [
                SystemMessage(content=self.system_prompt),
                HumanMessage(content=f"Question: {question}\n\nResponse: {response}")
            ]
            
            # Add timeout to the model call
            result = await asyncio.wait_for(
                self.model.agenerate([messages]),
                timeout=self.request_timeout
            )
            
            evaluation_text = result.generations[0][0].text
            logger.debug(f"Raw evaluation response: {evaluation_text}")
            
            return self._parse_evaluation(evaluation_text, question, response)
            
        except asyncio.TimeoutError:
            logger.error("Evaluation request timed out")
            return self._get_error_evaluation("Evaluation timed out. Please try again.")
        except Exception as e:
            logger.error(f"Error in evaluate_response: {str(e)}", exc_info=True)
            return self._get_error_evaluation(f"Evaluation error: {str(e)}")

    def _parse_evaluation(self, evaluation_text: str, question: str, response: str) -> Dict[str, Any]:
        """Parse the model's evaluation response with robust error handling."""
        try:
            # Try to extract JSON from the response
            json_match = re.search(r'\{.*\}', evaluation_text, re.DOTALL)
            if json_match:
                import json
                try:
                    evaluation = json.loads(json_match.group(0))
                    # Validate required fields
                    if all(key in evaluation for key in ['score', 'feedback', 'suggestions']):
                        return {
                            'score': max(1, min(10, int(evaluation['score']))),  # Ensure score is between 1-10
                            'correction': evaluation.get('correction'),
                            'feedback': evaluation['feedback'],
                            'suggestions': evaluation['suggestions'][:3],  # Limit to 3 suggestions
                            'is_appropriate': evaluation.get('is_appropriate', True),
                            'original_response': response,
                            'is_fallback': False
                        }
                except (json.JSONDecodeError, KeyError, ValueError) as e:
                    logger.warning(f"Failed to parse evaluation JSON: {e}")
            
            # Fallback to regex-based parsing if JSON parsing fails
            return self._fallback_parse_evaluation(evaluation_text, response)
            
        except Exception as e:
            logger.error(f"Error in _parse_evaluation: {str(e)}", exc_info=True)
            return self._get_default_evaluation(question, response)

    def _fallback_parse_evaluation(self, text: str, response: str) -> Dict[str, Any]:
        """Fallback parsing when JSON parsing fails."""
        try:
            # Try to extract score (look for number 1-10)
            score_match = re.search(r'(?i)score[\s:]*([1-9]|10)', text)
            score = int(score_match.group(1)) if score_match else 5
            
            # Try to extract feedback (everything after 'feedback:' or similar)
            feedback_match = re.search(r'(?i)(?:feedback|comment)[\s:]*([^\n]+)', text)
            feedback = feedback_match.group(1).strip() if feedback_match else "Thank you for your response."
            
            # Try to extract suggestions (look for bullet points or numbered lists)
            suggestions = re.findall(r'(?:[-•*]|\d+\.)\s*([^\n]+)', text)
            if not suggestions:
                suggestions = [
                    "Try to speak clearly and use complete sentences.",
                    "Practice speaking about this topic more to improve fluency."
                ]
            
            return {
                'score': score,
                'correction': None,
                'feedback': feedback,
                'suggestions': suggestions[:3],
                'is_appropriate': True,
                'original_response': response,
                'is_fallback': True
            }
            
        except Exception as e:
            logger.error(f"Error in fallback parsing: {str(e)}")
            return self._get_default_evaluation("", response)

    def _get_default_evaluation(self, question: str, response: str) -> Dict[str, Any]:
        return {
            'score': 5,
            'correction': None,
            'feedback': 'Thank you for your response. Keep practicing!',
            'suggestions': [
                'Try to speak clearly and use complete sentences.',
                'Practice speaking about this topic more to improve fluency.'
            ],
            'is_appropriate': True,
            'original_response': response,
            'is_fallback': True
        }
        
    def _get_error_evaluation(self, error_message: str) -> Dict[str, Any]:
        return {
            'score': 0,
            'correction': None,
            'feedback': 'Sorry, there was an error processing your response. ' + error_message,
            'suggestions': [
                'Please try again in a moment.',
                'Make sure your response was clear and audible.'
            ],
            'is_appropriate': True,
            'is_fallback': True,
            'error': error_message
        }