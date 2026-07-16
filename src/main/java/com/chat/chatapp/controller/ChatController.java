package com.chat.chatapp.controller;

import com.chat.chatapp.model.Message;
import com.chat.chatapp.repository.MessageRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final MessageRepository messageRepository;

    public ChatController(MessageRepository messageRepository) {
        this.messageRepository = messageRepository;
    }

    @GetMapping("/history")
    public ResponseEntity<?> getChatHistory(@RequestParam("with") String with, HttpSession session) {
        String currentUser = (String) session.getAttribute("user");
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
        }

        List<Message> history;
        if ("global".equalsIgnoreCase(with)) {
            history = messageRepository.findByRecipientOrderByTimestampAsc("global");
        } else {
            history = messageRepository.findChatHistory(currentUser, with);
        }

        return ResponseEntity.ok(history);
    }
}
