package com.yunhwan.speechtospeech.sessions

import com.yunhwan.speechtospeech.sessions.dto.SessionSummaryRequest
import com.yunhwan.speechtospeech.sessions.dto.SessionSummaryResponse
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/sessions")
class SessionSummaryController(
	private val sessionSummaryService: SessionSummaryService,
) {
	@PostMapping("/summary")
	fun summarizeSession(
		@RequestBody request: SessionSummaryRequest,
	): SessionSummaryResponse = sessionSummaryService.summarize(request)
}
