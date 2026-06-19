package com.yunhwan.speechtospeech.sessions.dto

data class SessionSummaryResponse(
	val title: String,
	val summary: String,
	val tasks: List<String>,
)
