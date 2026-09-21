package com.example.order.kafka;

import com.example.order.dto.OrderEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventProducer {

    private final KafkaTemplate<String, OrderEvent> kafkaTemplate;

    @Value("${app.kafka.topics.order-created}")
    private String orderCreatedTopic;

    public void publishOrderCreated(OrderEvent event) {
        log.info("Publishing order event to topic [{}]: orderId={}, eventType={}",
                orderCreatedTopic, event.getOrderId(), event.getEventType());

        CompletableFuture<SendResult<String, OrderEvent>> future =
                kafkaTemplate.send(orderCreatedTopic, String.valueOf(event.getOrderId()), event);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("Failed to publish order event for orderId={}: {}", event.getOrderId(), ex.getMessage(), ex);
            } else {
                log.info("Order event published successfully: orderId={}, partition={}, offset={}",
                        event.getOrderId(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            }
        });
    }
}
