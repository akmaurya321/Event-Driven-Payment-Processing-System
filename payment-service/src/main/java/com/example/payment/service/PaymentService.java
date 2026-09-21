package com.example.payment.service;

import com.example.payment.dto.OrderEvent;
import com.example.payment.dto.PaymentEvent;
import com.example.payment.dto.PaymentResponse;
import com.example.payment.entity.Payment;
import com.example.payment.entity.enums.PaymentStatus;
import com.example.payment.exception.PaymentNotFoundException;
import com.example.payment.kafka.PaymentEventProducer;
import com.example.payment.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private static final String PAYMENT_COMPLETED_EVENT = "PAYMENT_COMPLETED";

    private final PaymentRepository paymentRepository;
    private final PaymentEventProducer paymentEventProducer;

    @Value("${app.payment.simulation-delay-ms:1500}")
    private long simulationDelayMs;

    @Value("${app.payment.failure-threshold:0}")
    private BigDecimal failureThreshold;

    @Transactional
    public void processPayment(OrderEvent orderEvent) {
        if (paymentRepository.findByOrderId(orderEvent.getOrderId()).isPresent()) {
            log.warn("Payment already exists for orderId={}, skipping duplicate event", orderEvent.getOrderId());
            return;
        }

        log.info("Starting payment simulation for orderId={}", orderEvent.getOrderId());
        simulateProcessingDelay();

        PaymentStatus status = resolvePaymentStatus(orderEvent.getAmount());
        String message = status == PaymentStatus.SUCCESS
                ? "Payment processed successfully"
                : "Payment failed: amount below minimum threshold";

        Payment payment = Payment.builder()
                .orderId(orderEvent.getOrderId())
                .customerName(orderEvent.getCustomerName())
                .amount(orderEvent.getAmount())
                .status(status)
                .message(message)
                .processedAt(LocalDateTime.now())
                .build();

        Payment saved = paymentRepository.save(payment);
        log.info("Payment saved: paymentId={}, orderId={}, status={}", saved.getId(), saved.getOrderId(), saved.getStatus());

        PaymentEvent event = PaymentEvent.builder()
                .orderId(saved.getOrderId())
                .paymentId(saved.getId())
                .amount(saved.getAmount())
                .status(saved.getStatus())
                .message(saved.getMessage())
                .eventType(PAYMENT_COMPLETED_EVENT)
                .eventTime(LocalDateTime.now())
                .build();

        paymentEventProducer.publishPaymentResult(event);
    }

    @Transactional(readOnly = true)
    public PaymentResponse getPaymentByOrderId(Long orderId) {
        Payment payment = paymentRepository.findByOrderId(orderId)
                .orElseThrow(() -> new PaymentNotFoundException("Payment not found for order id: " + orderId));
        return toResponse(payment);
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> getAllPayments() {
        return paymentRepository.findAllByOrderByProcessedAtDesc().stream()
                .map(this::toResponse)
                .toList();
    }

    private PaymentStatus resolvePaymentStatus(BigDecimal amount) {
        if (amount == null || amount.compareTo(failureThreshold) <= 0) {
            return PaymentStatus.FAILED;
        }
        return PaymentStatus.SUCCESS;
    }

    private void simulateProcessingDelay() {
        try {
            Thread.sleep(simulationDelayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Payment simulation interrupted");
        }
    }

    private PaymentResponse toResponse(Payment payment) {
        return PaymentResponse.builder()
                .id(payment.getId())
                .orderId(payment.getOrderId())
                .customerName(payment.getCustomerName())
                .amount(payment.getAmount())
                .status(payment.getStatus())
                .message(payment.getMessage())
                .processedAt(payment.getProcessedAt())
                .build();
    }
}
