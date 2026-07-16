package com.chat.chatapp.controller;

import com.chat.chatapp.model.User;
import com.chat.chatapp.repository.UserRepository;
import jakarta.servlet.http.HttpSession;
import org.mindrot.jbcrypt.BCrypt;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;

    @org.springframework.beans.factory.annotation.Value("${google.client.id}")
    private String googleClientId;

    // A list of fun departments and roles to mock the design in the user screenshot
    private static final List<String> DEPARTMENTS = Arrays.asList(
        "Technical Department", "UI/UX Design Team", "Marketing & Growth", 
        "Customer Success", "Product Management", "QA Engineering"
    );
    private static final List<String> ROLES = Arrays.asList(
        "Senior Developer", "UI/UX Designer", "Team Worker", 
        "Product Owner", "Support Specialist", "QA Tester", "Architect"
    );

    public AuthController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/oauth2/config")
    public ResponseEntity<?> getOAuth2Config(jakarta.servlet.http.HttpServletRequest request) {
        String scheme = request.getScheme();
        String serverName = request.getServerName();
        int serverPort = request.getServerPort();
        
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        if (forwardedProto != null) {
            scheme = forwardedProto;
        }
        
        String redirectUri = scheme + "://" + serverName;
        if (serverPort != 80 && serverPort != 443 && forwardedProto == null) {
            redirectUri += ":" + serverPort;
        }
        redirectUri += "/login/oauth2/code/google";

        Map<String, String> config = new HashMap<>();
        config.put("clientId", googleClientId);
        config.put("redirectUri", redirectUri);
        return ResponseEntity.ok(config);
    }


    // Helper to generate a stable mock role/department based on username hash
    private Map<String, String> getMockProfile(String username) {
        int hash = Math.abs(username.hashCode());
        String dept = DEPARTMENTS.get(hash % DEPARTMENTS.size());
        String role = ROLES.get(hash % ROLES.size());
        
        Map<String, String> profile = new HashMap<>();
        profile.put("username", username);
        profile.put("department", dept);
        profile.put("role", role);
        return profile;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String password = request.get("password");

        if (username == null || username.trim().isEmpty() || password == null || password.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username and password cannot be empty"));
        }

        username = username.trim();
        if (userRepository.findByUsername(username).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Username already exists"));
        }

        String hashedPassword = BCrypt.hashpw(password, BCrypt.gensalt());
        User user = new User(username, hashedPassword);
        userRepository.save(user);

        return ResponseEntity.ok(Map.of("message", "User registered successfully"));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request, HttpSession session) {
        String username = request.get("username");
        String password = request.get("password");

        if (username == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username and password are required"));
        }

        username = username.trim();
        Optional<User> userOpt = userRepository.findByUsername(username);

        if (userOpt.isEmpty() || !BCrypt.checkpw(password, userOpt.get().getPasswordHash())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Invalid username or password"));
        }

        // Store user in session
        session.setAttribute("user", username);
        return ResponseEntity.ok(Map.of("message", "Login successful", "username", username));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser(HttpSession session) {
        String username = (String) session.getAttribute("user");
        if (username == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
        }
        
        Map<String, String> profile = getMockProfile(username);
        return ResponseEntity.ok(profile);
    }

    @GetMapping("/users")
    public ResponseEntity<?> getRegisteredUsers(HttpSession session) {
        String currentUser = (String) session.getAttribute("user");
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
        }

        // Return all registered users except current logged in user
        List<Map<String, String>> userProfiles = userRepository.findAll().stream()
                .map(User::getUsername)
                .filter(name -> !name.equalsIgnoreCase(currentUser))
                .map(this::getMockProfile)
                .collect(Collectors.toList());

        return ResponseEntity.ok(userProfiles);
    }
}
