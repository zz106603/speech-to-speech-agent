package com.yunhwan.speechtospeech.realtime

import com.yunhwan.speechtospeech.realtime.dto.RealtimeTokenResponse
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/realtime")
class RealtimeTokenController(
	private val realtimeTokenService: RealtimeTokenService,
) {
	@PostMapping("/token")
	fun createToken(): RealtimeTokenResponse =
		RealtimeTokenResponse(token = realtimeTokenService.createToken())
}
