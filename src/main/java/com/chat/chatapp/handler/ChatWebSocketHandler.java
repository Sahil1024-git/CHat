package com.chat.chatapp.handler;

import com.chat.chatapp.model.Message;
import com.chat.chatapp.repository.MessageRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    // Map username to a set of active WebSocket sessions
    private static final Map<String, Set<WebSocketSession>> userSessions = new ConcurrentHashMap<>();
    private final MessageRepository messageRepository;
    private final ObjectMapper objectMapper;

    public ChatWebSocketHandler(MessageRepository messageRepository) {
        this.messageRepository = messageRepository;
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule()); // Support LocalDateTime serialization
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String username = (String) session.getAttributes().get("user");
        if (username == null) {
            session.close(CloseStatus.POLICY_VIOLATION.withReason("User not authenticated"));
            return;
        }

        userSessions.computeIfAbsent(username, k -> new CopyOnWriteArraySet<>()).add(session);

        // Notify others that this user is online
        broadcastStatus(username, true);

        // Send the list of currently online users to the newly connected user
        sendOnlineUsersList(session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String sender = (String) session.getAttributes().get("user");
        if (sender == null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }

        try {
            Map<String, Object> payload = objectMapper.readValue(message.getPayload(), Map.class);
            String type = (String) payload.get("type");

            if ("CHAT".equalsIgnoreCase(type)) {
                String recipient = (String) payload.get("recipient");
                String content = (String) payload.get("content");

                if (recipient == null || content == null || content.trim().isEmpty()) {
                    return;
                }

                // Save message to SQLite db
                Message chatMsg = new Message(sender, recipient, content, LocalDateTime.now());
                messageRepository.save(chatMsg);

                // Broadcast to recipient and sender
                Map<String, Object> response = new HashMap<>();
                response.put("type", "CHAT");
                response.put("id", chatMsg.getId());
                response.put("sender", chatMsg.getSender());
                response.put("recipient", chatMsg.getRecipient());
                response.put("content", chatMsg.getContent());
                response.put("timestamp", chatMsg.getTimestamp().toString());

                String responseJson = objectMapper.writeValueAsString(response);
                sendToUser(recipient, responseJson);
                if (!recipient.equalsIgnoreCase(sender) && !"global".equalsIgnoreCase(recipient)) {
                    sendToUser(sender, responseJson);
                }


            } else if ("TYPING".equalsIgnoreCase(type)) {
                String recipient = (String) payload.get("recipient");
                Boolean status = (Boolean) payload.get("status");

                if (recipient == null || status == null) {
                    return;
                }

                // Forward typing indicator to the recipient
                Map<String, Object> response = new HashMap<>();
                response.put("type", "TYPING");
                response.put("sender", sender);
                response.put("status", status);

                String responseJson = objectMapper.writeValueAsString(response);
                sendToUser(recipient, responseJson);
            } else if ("CALL_OFFER".equalsIgnoreCase(type) || "CALL_ANSWER".equalsIgnoreCase(type) || 
                       "ICE_CANDIDATE".equalsIgnoreCase(type) || "CALL_DECLINE".equalsIgnoreCase(type) || 
                       "CALL_END".equalsIgnoreCase(type)) {
                String recipient = (String) payload.get("recipient");
                if (recipient != null) {
                    payload.put("sender", sender);
                    String payloadJson = objectMapper.writeValueAsString(payload);
                    sendToUser(recipient, payloadJson);
                }
            }

        } catch (Exception e) {
            System.err.println("Error parsing websocket message: " + e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String username = (String) session.getAttributes().get("user");
        if (username != null) {
            Set<WebSocketSession> sessions = userSessions.get(username);
            if (sessions != null) {
                sessions.remove(session);
                if (sessions.isEmpty()) {
                    userSessions.remove(username);
                    // Notify others that this user went offline
                    broadcastStatus(username, false);
                }
            }
        }
    }

    // Helper to send a message to all open sessions of a specific user
    private void sendToUser(String username, String payload) {
        if ("global".equalsIgnoreCase(username)) {
            // Broadcast to everyone
            broadcastToAll(payload);
            return;
        }

        Set<WebSocketSession> sessions = userSessions.get(username);
        if (sessions != null) {
            for (WebSocketSession session : sessions) {
                if (session.isOpen()) {
                    sendMessageSafe(session, payload);
                }
            }
        }
    }

    // Helper to broadcast message to all online users
    private void broadcastToAll(String payload) {
        for (Set<WebSocketSession> sessions : userSessions.values()) {
            for (WebSocketSession session : sessions) {
                if (session.isOpen()) {
                    sendMessageSafe(session, payload);
                }
            }
        }
    }

    // Helper to broadcast status changes (online/offline)
    private void broadcastStatus(String username, boolean online) {
        Map<String, Object> statusMsg = new HashMap<>();
        statusMsg.put("type", "STATUS");
        statusMsg.put("username", username);
        statusMsg.put("online", online);

        try {
            String payload = objectMapper.writeValueAsString(statusMsg);
            broadcastToAll(payload);
        } catch (IOException e) {
            System.err.println("Error serializing status broadcast: " + e.getMessage());
        }
    }

    // Helper to send the current online users list to a session
    private void sendOnlineUsersList(WebSocketSession session) {
        Map<String, Object> listMsg = new HashMap<>();
        listMsg.put("type", "ONLINE_USERS");
        listMsg.put("users", new ArrayList<>(userSessions.keySet()));

        try {
            String payload = objectMapper.writeValueAsString(listMsg);
            sendMessageSafe(session, payload);
        } catch (IOException e) {
            System.err.println("Error sending online users list: " + e.getMessage());
        }
    }

    // Thread-safe message delivery
    private void sendMessageSafe(WebSocketSession session, String payload) {
        synchronized (session) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(payload));
                }
            } catch (IOException e) {
                System.err.println("Error sending websocket message to session " + session.getId() + ": " + e.getMessage());
            }
        }
    }
}
