package com.yunhwan.speechtospeech.sessions

import com.yunhwan.speechtospeech.sessions.dto.SessionSummaryRequest
import com.yunhwan.speechtospeech.sessions.dto.SessionSummaryResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestClientResponseException
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.ObjectMapper

@Service
class SessionSummaryService(
	restClientBuilder: RestClient.Builder,
	private val objectMapper: ObjectMapper,
	@Value("\${openai.api-key:}") private val openAiApiKey: String,
	@Value("\${openai.summary-model:gpt-4.1-mini}") private val summaryModel: String,
) {
	private val restClient: RestClient = restClientBuilder
		.baseUrl("https://api.openai.com")
		.build()

	fun summarize(request: SessionSummaryRequest): SessionSummaryResponse {
		val apiKey = openAiApiKey.trim()
		if (apiKey.isBlank()) {
			throw ResponseStatusException(
				HttpStatus.INTERNAL_SERVER_ERROR,
				"OpenAI API key is not configured",
			)
		}

		val response = try {
			restClient.post()
				.uri("/v1/chat/completions")
				.header(HttpHeaders.AUTHORIZATION, "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(CreateSummaryRequest(model = summaryModel, messages = buildMessages(request)))
				.retrieve()
				.body(OpenAiChatCompletionResponse::class.java)
		} catch (_: RestClientResponseException) {
			throw ResponseStatusException(
				HttpStatus.BAD_GATEWAY,
				"Failed to create session summary",
			)
		} catch (_: RestClientException) {
			throw ResponseStatusException(
				HttpStatus.BAD_GATEWAY,
				"Failed to create session summary",
			)
		}

		val content = response?.choices?.firstOrNull()?.message?.content?.trim().orEmpty()
		if (content.isBlank()) {
			throw ResponseStatusException(
				HttpStatus.BAD_GATEWAY,
				"OpenAI response did not include a summary",
			)
		}

		return try {
			objectMapper.readValue(content, SessionSummaryResponse::class.java)
		} catch (_: RuntimeException) {
			throw ResponseStatusException(
				HttpStatus.BAD_GATEWAY,
				"OpenAI response summary was invalid",
			)
		}
	}

	private fun buildMessages(request: SessionSummaryRequest): List<OpenAiChatMessage> {
		val conversation = request.messages
			.filter { it.content.isNotBlank() }
			.joinToString("\n") { "${it.role}: ${it.content}" }
			.ifBlank { "대화 로그 없음" }
		val tasks = request.tasks
			.filter { it.isNotBlank() }
			.joinToString("\n") { "- $it" }
			.ifBlank { "저장된 할 일 없음" }

		return listOf(
			OpenAiChatMessage(
				role = "system",
				content = "너는 루코 세션을 요약하는 도우미다. 반드시 요청된 JSON 구조로만 한국어 응답을 작성한다.",
			),
			OpenAiChatMessage(
				role = "user",
				content = """
				다음 음성 대화 세션을 간결하게 요약해줘.

				대화 로그:
				$conversation

				저장된 할 일:
				$tasks
				""".trimIndent(),
			),
		)
	}
}

private data class CreateSummaryRequest(
	val model: String,
	val messages: List<OpenAiChatMessage>,
	val response_format: OpenAiResponseFormat = OpenAiResponseFormat(),
)

private data class OpenAiChatMessage(
	val role: String,
	val content: String,
)

private data class OpenAiResponseFormat(
	val type: String = "json_schema",
	val json_schema: OpenAiJsonSchema = OpenAiJsonSchema(),
)

private data class OpenAiJsonSchema(
	val name: String = "session_summary",
	val strict: Boolean = true,
	val schema: Map<String, Any> = mapOf(
		"type" to "object",
		"properties" to mapOf(
			"title" to mapOf(
				"type" to "string",
				"description" to "세션 내용을 대표하는 짧은 한국어 제목",
			),
			"summary" to mapOf(
				"type" to "string",
				"description" to "대화 흐름과 사용자의 의도를 담은 한국어 요약",
			),
			"tasks" to mapOf(
				"type" to "array",
				"items" to mapOf("type" to "string"),
				"description" to "세션에서 저장된 할 일 목록",
			),
		),
		"required" to listOf("title", "summary", "tasks"),
		"additionalProperties" to false,
	),
)

private data class OpenAiChatCompletionResponse(
	val choices: List<OpenAiChoice> = emptyList(),
)

private data class OpenAiChoice(
	val message: OpenAiChatCompletionMessage? = null,
)

private data class OpenAiChatCompletionMessage(
	val content: String? = null,
)
