package com.resihub.api.security;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

@Service
public class UserAccessService {
    private final JdbcTemplate jdbc;

    public UserAccessService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public String role(UUID userId) {
        String role = jdbc.query("select role from public.profiles where id = ?", rs -> rs.next() ? rs.getString(1) : null, userId);
        if (role == null) throw new AccessDeniedException("A ResiHub user profile is required");
        return role;
    }

    public void requireLandlordOrAdmin(UUID userId) {
        String role = role(userId);
        if (!"landlord".equals(role) && !"admin".equals(role)) {
            throw new AccessDeniedException("Landlord access is required");
        }
    }

    public void requirePropertyOwner(UUID userId, UUID propertyId) {
        requireLandlordOrAdmin(userId);
        Boolean owner = jdbc.queryForObject("select exists(select 1 from public.listings where id = ? and landlord_id = ?)", Boolean.class, propertyId, userId);
        if (!Boolean.TRUE.equals(owner) && !"admin".equals(role(userId))) {
            throw new AccessDeniedException("You do not own this property");
        }
    }
}
