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
public class PaymentEvent {

    private Long orderId;
    private Long paymentId;
    private BigDecimal amount;
    private PaymentStatus status;
    private String message;
    private String eventType;
    private LocalDateTime eventTime;
}
