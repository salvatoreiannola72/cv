import os
import json
import time
from abc import ABC, abstractmethod
import google.generativeai as genai
from openai import OpenAI
import ollama

class LLMProvider(ABC):
    @abstractmethod
    def generate_analysis(self, prompt: str) -> dict:
        pass

class GoogleProvider(LLMProvider):
    def __init__(self, model_name: str, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)

    def generate_analysis(self, prompt: str) -> dict:
        try:
            # Add delay to avoid rate limits
            time.sleep(2) 
            response = self.model.generate_content(prompt)
            # Clean up response text to ensure it's valid JSON
            text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(text)
        except Exception as e:
            print(f"Error generating content with Google: {e}")
            return {}

class OpenAIProvider(LLMProvider):
    def __init__(self, model_name: str, api_key: str):
        self.client = OpenAI(api_key=api_key)
        self.model_name = model_name

    def generate_analysis(self, prompt: str) -> dict:
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that outputs JSON."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"Error generating content with OpenAI: {e}")
            return {}

class OllamaProvider(LLMProvider):
    def __init__(self, model_name: str):
        self.model_name = model_name

    def generate_analysis(self, prompt: str) -> dict:
        try:
            response = ollama.chat(model=self.model_name, messages=[
                {
                    'role': 'user',
                    'content': prompt,
                },
            ])
            # Attempt to parse JSON from the response
            content = response['message']['content']
            # Find JSON block if wrapped in markdown
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                 content = content.split("```")[1].split("```")[0].strip()
            
            return json.loads(content)
        except Exception as e:
            print(f"Error generating content with Ollama: {e}")
            return {}

class LLMFactory:
    @staticmethod
    def create_provider(config: dict) -> LLMProvider:
        provider_type = config.get("provider", "google").lower()
        model_name = config.get("model", "gemini-2.5-flash")

        if provider_type == "google":
            api_key = os.environ.get("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GOOGLE_API_KEY not found in environment variables")
            return GoogleProvider(model_name, api_key)
        
        elif provider_type == "openai":
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not found in environment variables")
            return OpenAIProvider(model_name, api_key)
            
        elif provider_type == "ollama":
            return OllamaProvider(model_name)
            
        else:
            raise ValueError(f"Unsupported provider: {provider_type}")
