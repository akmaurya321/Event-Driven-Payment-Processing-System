package com.example.payment.kafka;

import com.example.payment.dto.OrderEvent;
import com.example.payment.service.PaymentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventConsumer {

    private final PaymentService paymentService;

    @KafkaListener(
            topics = "${app.kafka.topics.order-created}",
            groupId = "${spring.kafka.consumer.group-id}",
            containerFactory = "orderEventKafkaListenerContainerFactory")
    public void consumeOrderCreated(OrderEvent event) {
        log.info("Received order event: orderId={}, eventType={}, amount={}",
                event.getOrderId(), event.getEventType(), event.getAmount());
        paymentService.processPayment(event);
    }
}
