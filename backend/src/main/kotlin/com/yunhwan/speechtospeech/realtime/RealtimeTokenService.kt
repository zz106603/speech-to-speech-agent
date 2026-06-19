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
import org.slf4j.LoggerFactory

@Service
class RealtimeTokenService(
	restClientBuilder: RestClient.Builder,
	@Value("\${openai.api-key:}") private val openAiApiKey: String,
) {
	private val restClient: RestClient = restClientBuilder
		.baseUrl(OPENAI_BASE_URL)
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
				.uri(REALTIME_CLIENT_SECRETS_PATH)
				.header(HttpHeaders.AUTHORIZATION, "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(CreateRealtimeClientSecretRequest())
				.retrieve()
				.body(OpenAiRealtimeClientSecretResponse::class.java)
		} catch (exception: RestClientResponseException) {
			logger.error(
				"OpenAI Realtime token request failed. url={}, status={}, body={}",
				REALTIME_CLIENT_SECRETS_URL,
				exception.statusCode.value(),
				exception.responseBodyAsString,
				exception,
			)
			throw ResponseStatusException(
				HttpStatus.BAD_GATEWAY,
				"Failed to create Realtime token",
				exception,
			)
		} catch (exception: RestClientException) {
			logger.error(
				"OpenAI Realtime token request failed before receiving a response. url={}, error={}",
				REALTIME_CLIENT_SECRETS_URL,
				exception.message,
				exception,
			)
			throw ResponseStatusException(
				HttpStatus.BAD_GATEWAY,
				"Failed to create Realtime token",
				exception,
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

	private companion object {
		private const val OPENAI_BASE_URL = "https://api.openai.com"
		private const val REALTIME_CLIENT_SECRETS_PATH = "/v1/realtime/client_secrets"
		private const val REALTIME_CLIENT_SECRETS_URL = OPENAI_BASE_URL + REALTIME_CLIENT_SECRETS_PATH
		private val logger = LoggerFactory.getLogger(RealtimeTokenService::class.java)
	}
}

private data class CreateRealtimeClientSecretRequest(
	val session: RealtimeSessionConfig = RealtimeSessionConfig(),
)

private data class RealtimeSessionConfig(
	val type: String = "realtime",
	val model: String = "gpt-realtime-mini",
	val instructions: String = REALTIME_INSTRUCTIONS,
	val tools: List<RealtimeToolConfig> = listOf(RealtimeToolConfig()),
	val tool_choice: String = "auto",
	val audio: RealtimeAudioConfig = RealtimeAudioConfig(),
)

private const val REALTIME_INSTRUCTIONS = """
너는 "루코"라는 이름의 루틴 코치다.
사용자가 해야 할 일, 습관, 목표를 정리하도록 돕는다.
친근하고 자연스럽게, 짧고 간결하게 답한다.
가벼운 잔소리를 섞을 수 있지만 사용자를 비난하지 않는다.
사용자가 저장 의도를 명확하게 표현했을 때만 save_task 도구를 호출한다.
저장 후에는 짧게 격려한다.
한 번에 너무 많은 질문을 하지 않는다.
답변은 가능한 한 3문장 이내로 유지한다.
개인정보, 주소, 전화번호, 계좌번호 등을 묻지 않는다.
의료, 법률, 금융 전문가처럼 행동하지 않는다.
"""

private data class RealtimeToolConfig(
	val type: String = "function",
	val name: String = "save_task",
	val description: String = "사용자가 저장하고 싶은 할 일이나 루틴을 앱 화면의 할 일 목록에 추가한다.",
	val parameters: RealtimeToolParameters = RealtimeToolParameters(),
)

private data class RealtimeToolParameters(
	val type: String = "object",
	val properties: Map<String, RealtimeToolProperty> = mapOf(
		"task" to RealtimeToolProperty(
			type = "string",
			description = "저장할 할 일이나 루틴",
		),
	),
	val required: List<String> = listOf("task"),
)

private data class RealtimeToolProperty(
	val type: String,
	val description: String,
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
