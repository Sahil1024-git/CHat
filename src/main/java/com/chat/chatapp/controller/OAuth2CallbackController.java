package com.chat.chatapp.controller;

import com.chat.chatapp.model.User;
import com.chat.chatapp.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.mindrot.jbcrypt.BCrypt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

@Controller
public class OAuth2CallbackController {

    private final UserRepository userRepository;

    @Value("${google.client.id}")
    private String googleClientId;

    @Value("${google.client.secret}")
    private String googleClientSecret;

    public OAuth2CallbackController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/login/oauth2/code/google")
    public void googleCallback(@RequestParam("code") String code, 
                               HttpSession session, 
                               HttpServletRequest request, 
                               HttpServletResponse response) throws IOException {
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

        try {
            // Exchange authorization code for access token
            RestTemplate restTemplate = new RestTemplate();
            HttpHeaders tokenHeaders = new HttpHeaders();
            tokenHeaders.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

            MultiValueMap<String, String> tokenBody = new LinkedMultiValueMap<>();
            tokenBody.add("code", code);
            tokenBody.add("client_id", googleClientId);
            tokenBody.add("client_secret", googleClientSecret);
            tokenBody.add("redirect_uri", redirectUri);
            tokenBody.add("grant_type", "authorization_code");

            HttpEntity<MultiValueMap<String, String>> tokenRequest = new HttpEntity<>(tokenBody, tokenHeaders);
            ResponseEntity<Map> tokenResponseEntity = restTemplate.postForEntity("https://oauth2.googleapis.com/token", tokenRequest, Map.class);
            Map<String, Object> tokenResponse = tokenResponseEntity.getBody();
            
            if (tokenResponse == null || !tokenResponse.containsKey("access_token")) {
                response.sendRedirect("/?error=oauth_token_failed");
                return;
            }
            
            String accessToken = (String) tokenResponse.get("access_token");

            // Fetch user profile from Google UserInfo API
            HttpHeaders infoHeaders = new HttpHeaders();
            infoHeaders.setBearerAuth(accessToken);
            HttpEntity<String> infoRequest = new HttpEntity<>(infoHeaders);
            
            ResponseEntity<Map> infoResponseEntity = restTemplate.exchange(
                "https://www.googleapis.com/oauth2/v3/userinfo", 
                HttpMethod.GET, 
                infoRequest, 
                Map.class
            );
            Map<String, Object> userInfo = infoResponseEntity.getBody();
            
            if (userInfo == null || !userInfo.containsKey("email")) {
                response.sendRedirect("/?error=oauth_user_failed");
                return;
            }

            String email = (String) userInfo.get("email");

            // Auto-register user if they do not exist
            if (userRepository.findByUsername(email).isEmpty()) {
                String randomPassword = UUID.randomUUID().toString();
                String hashedPassword = BCrypt.hashpw(randomPassword, BCrypt.gensalt());
                User user = new User(email, hashedPassword);
                userRepository.save(user);
            }

            // Set user session
            session.setAttribute("user", email);
            
            // Redirect back to main dashboard
            response.sendRedirect("/");
        } catch (Exception e) {
            e.printStackTrace();
            response.sendRedirect("/?error=oauth_exception&message=" + e.getMessage());
        }
    }
}
