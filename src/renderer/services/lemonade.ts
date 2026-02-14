import { CHAT_ENDPOINT, IMAGE_ENDPOINT, HEALTH_ENDPOINT } from '../../shared/constants'
import type { ChatCompletionRequest, ChatCompletionResponse, ImageGenerationRequest, ImageGenerationResponse } from '../types/api'

async function fetchJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Lemonade API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  return fetchJSON<ChatCompletionResponse>(CHAT_ENDPOINT, req)
}

export async function generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResponse> {
  return fetchJSON<ImageGenerationResponse>(IMAGE_ENDPOINT, req)
}

export async function checkHealth(): Promise<boolean> {
  try {
    console.log('[Lemonade] Checking health at:', HEALTH_ENDPOINT)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // Increase to 15s
    
    const res = await fetch(HEALTH_ENDPOINT, { 
      signal: controller.signal,
      method: 'GET',
    })
    clearTimeout(timeoutId)
    
    const isHealthy = res.ok
    console.log('[Lemonade] Health check result:', isHealthy, 'Status:', res.status)
    return isHealthy
  } catch (e) {
    console.error('[Lemonade] Health check failed:', e)
    return false
  }
}
