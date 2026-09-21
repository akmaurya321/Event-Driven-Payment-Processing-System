package com.example.order.kafka;

import com.example.order.dto.PaymentEvent;
import com.example.order.entity.enums.OrderStatus;
import com.example.order.service.OrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentEventConsumer {

    private final OrderService orderService;

    @KafkaListener(
            topics = "${app.kafka.topics.payment-completed}",
            groupId = "${spring.kafka.consumer.group-id}",
            containerFactory = "paymentEventKafkaListenerContainerFactory")
    public void consumePaymentCompleted(PaymentEvent event) {
        log.info("Received payment event: orderId={}, status={}, eventType={}",
                event.getOrderId(), event.getStatus(), event.getEventType());

        OrderStatus orderStatus = "SUCCESS".equalsIgnoreCase(event.getStatus())
                ? OrderStatus.PAID
                : OrderStatus.FAILED;

        orderService.updateOrderStatus(event.getOrderId(), orderStatus);
        log.info("Order status updated from payment event: orderId={}, orderStatus={}",
                event.getOrderId(), orderStatus);
    }
}
