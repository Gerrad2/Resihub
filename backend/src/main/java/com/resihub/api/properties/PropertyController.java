package com.resihub.api.properties;

import com.resihub.api.security.CurrentUser;
import com.resihub.api.security.UserAccessService;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class PropertyController {
    private final JdbcTemplate jdbc;
    private final CurrentUser currentUser;
    private final UserAccessService access;

    public PropertyController(JdbcTemplate jdbc, CurrentUser currentUser, UserAccessService access) {
        this.jdbc = jdbc; this.currentUser = currentUser; this.access = access;
    }

    @GetMapping("/public/properties")
    List<Map<String, Object>> browse(@RequestParam(required = false) UUID universityId, @RequestParam(defaultValue = "12") int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 50));
        String sql = "select p.id, p.title, p.description, p.property_type, p.address, p.area, p.price, p.university_id, p.created_at, u.name as university_name from public.listings p left join public.universities u on u.id = p.university_id where p.publication_status = 'published'" + (universityId == null ? "" : " and p.university_id = ?") + " order by p.created_at desc limit ?";
        return universityId == null ? jdbc.queryForList(sql, safeLimit) : jdbc.queryForList(sql, universityId, safeLimit);
    }

    @GetMapping("/landlord/properties")
    List<Map<String, Object>> mine(Authentication authentication) {
        UUID userId = currentUser.id(authentication);
        access.requireLandlordOrAdmin(userId);
        return jdbc.queryForList("select id, title, description, property_type, address, area, price, publication_status, created_at, updated_at from public.listings where landlord_id = ? order by created_at desc", userId);
    }

    @PostMapping("/landlord/properties")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> create(@Valid @RequestBody PropertyRequest request, Authentication authentication) {
        UUID userId = currentUser.id(authentication);
        access.requireLandlordOrAdmin(userId);
        return jdbc.queryForMap("insert into public.listings (landlord_id, university_id, title, description, property_type, address, area, price, publication_status) values (?, ?, ?, ?, ?, ?, ?, ?, 'draft') returning id, title, publication_status, created_at", userId, request.universityId(), request.title().trim(), request.description(), request.propertyType().trim(), request.address().trim(), request.area().trim(), request.basePrice());
    }

    @PatchMapping("/landlord/properties/{propertyId}")
    Map<String, Object> update(@PathVariable UUID propertyId, @Valid @RequestBody PropertyRequest request, Authentication authentication) {
        UUID userId = currentUser.id(authentication);
        access.requirePropertyOwner(userId, propertyId);
        return jdbc.queryForMap("update public.listings set university_id = ?, title = ?, description = ?, property_type = ?, address = ?, area = ?, price = ?, updated_at = now() where id = ? returning id, title, publication_status, updated_at", request.universityId(), request.title().trim(), request.description(), request.propertyType().trim(), request.address().trim(), request.area().trim(), request.basePrice(), propertyId);
    }
}
