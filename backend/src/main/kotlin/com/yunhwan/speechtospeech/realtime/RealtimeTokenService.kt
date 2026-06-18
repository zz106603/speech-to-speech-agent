package com.yunhwan.speechtospeech.realtime

import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestClientResponseException
import org.springframework.web.server.ResponseStatusException

@Service
class RealtimeTokenService(
	restClientBuilder: RestClient.Builder,
	@Value("\${openai.api-key:}") private val openAiApiKey: String,
) {
	private val restClient: RestClient = restClientBuilder
		.baseUrl("https://api.openai.com")
		.build()

	fun createToken(): String {
		val apiKey = openAiApiKey.trim()
		if (apiKey.isBlank()) {
			throw ResponseStatusException(
				HttpStatus.INTERNAL_SERVER_ERROR,
				"OpenAI API key is not configured",
			)
		}

		val response = try {
			restClient.post()
				.uri("/v1/realtime/client_secrets")
				.header(HttpHeaders.AUTHORIZATION, "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(CreateRealtimeClientSecretRequest())
				.retrieve()
				.body(OpenAiRealtimeClientSecretResponse::class.java)
		} catch (_: RestClientResponseException) {
			throw ResponseStatusException(
				HttpStatus.BAD_GATEWAY,
				"Failed to create Realtime token",
			)
		} catch (_: RestClientException) {
			throw ResponseStatusException(
				HttpStatus.BAD_GATEWAY,
				"Failed to create Realtime token",
			)
		}

		val token = response?.value?.trim().orEmpty()
		if (token.isBlank()) {
			throw ResponseStatusException(
				HttpStatus.BAD_GATEWAY,
				"OpenAI response did not include a token",
			)
		}

		return token
	}
}

private data class CreateRealtimeClientSecretRequest(
	val session: RealtimeSessionConfig = RealtimeSessionConfig(),
)

private data class RealtimeSessionConfig(
	val type: String = "realtime",
	val model: String = "gpt-realtime-mini",
	val audio: RealtimeAudioConfig = RealtimeAudioConfig(),
)

private data class RealtimeAudioConfig(
	val output: RealtimeAudioOutputConfig = RealtimeAudioOutputConfig(),
)

private data class RealtimeAudioOutputConfig(
	val voice: String = "marin",
)

private data class OpenAiRealtimeClientSecretResponse(
	val value: String?,
)
