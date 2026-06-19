package com.yunhwan.speechtospeech.sessions.dto

data class SessionSummaryRequest(
	val messages: List<SessionMessage> = emptyList(),
	val tasks: List<String> = emptyList(),
)

data class SessionMessage(
	val role: String,
	val content: String,
)
