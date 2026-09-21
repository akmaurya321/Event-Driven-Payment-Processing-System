package com.example.payment.dto;

import com.example.payment.entity.enums.PaymentStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentResponse {

    private Long id;
    private Long orderId;
    private String customerName;
    private BigDecimal amount;
    private PaymentStatus status;
    private String message;
    private LocalDateTime processedAt;
}
