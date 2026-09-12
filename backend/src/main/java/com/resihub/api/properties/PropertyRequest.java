package com.resihub.api.properties;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.UUID;

public record PropertyRequest(
    UUID universityId,
    @NotBlank @Size(max = 160) String title,
    @Size(max = 5000) String description,
    @NotBlank @Size(max = 80) String propertyType,
    @NotBlank @Size(max = 250) String address,
    @NotBlank @Size(max = 120) String area,
    @NotNull @DecimalMin("0.0") BigDecimal basePrice
) {}
