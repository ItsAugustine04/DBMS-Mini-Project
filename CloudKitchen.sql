DROP DATABASE IF EXISTS CloudKitchen;
CREATE DATABASE CloudKitchen;
USE CloudKitchen;


CREATE TABLE Customer (
    customerID INT AUTO_INCREMENT PRIMARY KEY,
    customerName VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    address VARCHAR(255)
);

CREATE TABLE CustomerPhone (
    customerID INT,
    phoneNumber VARCHAR(15),
    PRIMARY KEY (customerID, phoneNumber),
    FOREIGN KEY (customerID) REFERENCES Customer(customerID)
        ON DELETE CASCADE,
    UNIQUE (phoneNumber)
);



CREATE TABLE Kitchen (
    kitchenID INT AUTO_INCREMENT PRIMARY KEY,
    kitchenName VARCHAR(100) NOT NULL,
    location VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE
);

CREATE TABLE KitchenPhone (
    kitchenID INT,
    phoneNumber VARCHAR(15),
    PRIMARY KEY (kitchenID, phoneNumber),
    FOREIGN KEY (kitchenID) REFERENCES Kitchen(kitchenID)
        ON DELETE CASCADE,
    UNIQUE (phoneNumber)
);



CREATE TABLE DeliveryPartner (
    partnerID INT AUTO_INCREMENT PRIMARY KEY,
    partnerName VARCHAR(100) NOT NULL,
    vehicleType ENUM('Bike','Scooter','Car') NOT NULL,
    email VARCHAR(100) UNIQUE
);

CREATE TABLE DeliveryPartnerPhone (
    partnerID INT,
    phoneNumber VARCHAR(15),
    PRIMARY KEY (partnerID, phoneNumber),
    FOREIGN KEY (partnerID) REFERENCES DeliveryPartner(partnerID)
        ON DELETE CASCADE,
    UNIQUE (phoneNumber)
);



CREATE TABLE Menu (
    menuID INT AUTO_INCREMENT PRIMARY KEY,
    kitchenID INT,
    itemName VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    FOREIGN KEY (kitchenID) REFERENCES Kitchen(kitchenID)
        ON DELETE CASCADE
);



CREATE TABLE `Order` (
    orderID INT AUTO_INCREMENT PRIMARY KEY,
    customerID INT,
    kitchenID INT,
    totalAmount DECIMAL(10,2) DEFAULT 0,
    status ENUM('Placed','Preparing','Out for Delivery','Delivered','Cancelled') DEFAULT 'Placed',
    FOREIGN KEY (customerID) REFERENCES Customer(customerID),
    FOREIGN KEY (kitchenID) REFERENCES Kitchen(kitchenID)
);

CREATE TABLE OrderDetails (
    orderID INT,
    menuID INT,
    quantity INT NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (orderID, menuID),
    FOREIGN KEY (orderID) REFERENCES `Order`(orderID)
        ON DELETE CASCADE,
    FOREIGN KEY (menuID) REFERENCES Menu(menuID)
        ON DELETE CASCADE
);



CREATE TABLE Payment (
    paymentID INT AUTO_INCREMENT PRIMARY KEY,
    orderID INT,
    amount DECIMAL(10,2),
    paymentMethod ENUM('UPI','Card','Cash') NOT NULL,
    paymentDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orderID) REFERENCES `Order`(orderID)
        ON DELETE CASCADE
);



CREATE TABLE Delivery (
    deliveryID INT AUTO_INCREMENT PRIMARY KEY,
    orderID INT,
    partnerID INT,
    deliveryStatus ENUM('Assigned','Picked Up','Delivered','Cancelled') DEFAULT 'Assigned',
    deliveryTime TIMESTAMP NULL,
    FOREIGN KEY (orderID) REFERENCES `Order`(orderID)
        ON DELETE CASCADE,
    FOREIGN KEY (partnerID) REFERENCES DeliveryPartner(partnerID)
        ON DELETE SET NULL
);



DELIMITER $$

CREATE TRIGGER trg_update_order_total
AFTER INSERT ON OrderDetails
FOR EACH ROW
BEGIN
    UPDATE `Order`
    SET totalAmount = (
        SELECT SUM(od.quantity * m.price)
        FROM OrderDetails od
        JOIN Menu m ON od.menuID = m.menuID
        WHERE od.orderID = NEW.orderID
    )
    WHERE orderID = NEW.orderID;
END $$

CREATE TRIGGER trg_order_total_update
AFTER UPDATE ON OrderDetails
FOR EACH ROW
BEGIN
    UPDATE `Order`
    SET totalAmount = (
        SELECT SUM(od.quantity * m.price)
        FROM OrderDetails od
        JOIN Menu m ON od.menuID = m.menuID
        WHERE od.orderID = NEW.orderID
    )
    WHERE orderID = NEW.orderID;
END $$

CREATE TRIGGER trg_order_total_delete
AFTER DELETE ON OrderDetails
FOR EACH ROW
BEGIN
    UPDATE `Order`
    SET totalAmount = (
        SELECT IFNULL(SUM(od.quantity * m.price),0)
        FROM OrderDetails od
        JOIN Menu m ON od.menuID = m.menuID
        WHERE od.orderID = OLD.orderID
    )
    WHERE orderID = OLD.orderID;
END $$

DELIMITER ;



INSERT INTO Customer (customerName, address)
VALUES
('Ayush','Bangalore'),
('Ravi','Mumbai'),
('Augustine','Delhi'),
('John','Hyderabad');

INSERT INTO CustomerPhone VALUES
(1,'9999000011'),(1,'9999000022'),
(2,'8888000011'),
(3,'9929938212'),
(4,'8372992331'),(4,'3628923624');

INSERT INTO Kitchen (kitchenName, location)
VALUES
('Spice Hub','Bangalore'),
('Food Factory','Mumbai'),
('Coastal Gardens','Delhi'),
('ABC Kitchen','Hyderabad');

INSERT INTO KitchenPhone VALUES
(1,'7777000011'),
(2,'7777000022'),
(3,'8365728913'),
(4,'8764782930'),
(4,'7299488738');

INSERT INTO Menu (kitchenID, itemName, price)
VALUES
(1,'Biriyani',200),
(1,'Egg Roll',120),
(1,'Chicken Roll',140),
(2,'Pizza',350),
(2,'Chicken Burger',280),
(2,'French Fries',160),
(3,'Mac n Cheese',230),
(3,'Garlic Bread',150),
(4,'Butter Chicken',350),
(4,'Tandoori Roti',80),
(4,'Kerala Parotta',45);

INSERT INTO DeliveryPartner(partnerName, vehicleType)
VALUES
('Ramesh', 'Bike'),
('Suresh', 'Scooter'),
('Anita', 'Car');

DELIMITER $$

CREATE PROCEDURE place_new_order(
    IN p_customerID INT,
    IN p_kitchenID INT,
    IN p_menuID INT,
    IN p_quantity INT
)
BEGIN
    DECLARE new_order_id INT;

    -- create a new order row
    INSERT INTO `Order` (customerID, kitchenID, status)
    VALUES (p_customerID, p_kitchenID, 'Placed');

    -- capture the newly created order id
    SET new_order_id = LAST_INSERT_ID();

    -- insert the ordered item
    INSERT INTO OrderDetails (orderID, menuID, quantity)
    VALUES (new_order_id, p_menuID, p_quantity);

    -- return a friendly message
    SELECT CONCAT('Order placed successfully with ID: ', new_order_id) AS message;
END$$

DELIMITER ;


DELIMITER $$

CREATE PROCEDURE add_payment(
    IN p_orderID INT,
    IN p_paymentMethod ENUM('Credit Card', 'Debit Card', 'UPI', 'COD'),
    IN p_amount DECIMAL(10,2)
)
BEGIN
    DECLARE order_exists INT;

    -- Check if the order exists
    SELECT COUNT(*) INTO order_exists
    FROM `Order`
    WHERE orderID = p_orderID;

    IF order_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order ID does not exist. Please enter a valid order ID.';
    ELSE
        -- Insert payment details
        INSERT INTO Payment (orderID, paymentMethod, amount, paymentDate)
        VALUES (p_orderID, p_paymentMethod, p_amount, NOW());

        SELECT CONCAT('Payment successfully recorded for Order ID: ', p_orderID) AS message;
    END IF;
END$$

DELIMITER ;


USE CloudKitchen;

DROP PROCEDURE IF EXISTS assign_delivery_partner;
DELIMITER $$
CREATE PROCEDURE assign_delivery_partner(
    IN p_orderID INT,
    IN p_partnerID INT
)
BEGIN
    DECLARE order_exists INT;
    DECLARE partner_exists INT;
    DECLARE existing_delivery INT;

    -- Check existence
    SELECT COUNT(*) INTO order_exists FROM `Order` WHERE orderID = p_orderID;
    SELECT COUNT(*) INTO partner_exists FROM DeliveryPartner WHERE partnerID = p_partnerID;
    SELECT COUNT(*) INTO existing_delivery FROM Delivery WHERE orderID = p_orderID;

    IF order_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order ID does not exist';
    ELSEIF partner_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Delivery Partner ID does not exist';
    ELSE
        IF existing_delivery = 0 THEN
            -- create delivery row
            INSERT INTO Delivery (orderID, partnerID, deliveryStatus)
            VALUES (p_orderID, p_partnerID, 'Assigned');
        ELSE
            -- update existing delivery
            UPDATE Delivery
            SET partnerID = p_partnerID, deliveryStatus = 'Assigned'
            WHERE orderID = p_orderID;
        END IF;

        -- Optionally update Order.status too (keeps both in sync)
        UPDATE `Order`
        SET status = 'Out for Delivery'
        WHERE orderID = p_orderID;

        SELECT CONCAT('Partner ', p_partnerID, ' assigned to order ', p_orderID) AS message;
    END IF;
END$$
DELIMITER ;



SELECT c.customerID, c.customerName, GROUP_CONCAT(cp.phoneNumber) AS phoneNumbers
FROM Customer c
LEFT JOIN CustomerPhone cp ON c.customerID = cp.customerID
GROUP BY c.customerID;

SELECT k.kitchenID, k.kitchenName, GROUP_CONCAT(kp.phoneNumber) AS phoneNumbers
FROM Kitchen k
LEFT JOIN KitchenPhone kp ON k.kitchenID = kp.kitchenID
GROUP BY k.kitchenID;

SELECT k.kitchenName, m.itemName, m.price
FROM Menu m
JOIN Kitchen k ON m.kitchenID = k.kitchenID
ORDER BY k.kitchenName;

SELECT o.orderID, c.customerName, k.kitchenName, o.totalAmount, o.status
FROM `Order` o
JOIN Customer c ON o.customerID = c.customerID
JOIN Kitchen k ON o.kitchenID = k.kitchenID;

DELIMITER $$

CREATE FUNCTION get_customer_total_spent(p_customerID INT)
RETURNS DECIMAL(10,2)
DETERMINISTIC
BEGIN
    DECLARE total DECIMAL(10,2);
    SELECT IFNULL(SUM(totalAmount), 0)
    INTO total
    FROM `Order`
    WHERE customerID = p_customerID;
    RETURN total;
END$$

DELIMITER ;

SELECT get_customer_total_spent(1) AS TotalSpentByAyush;

DELIMITER $$

CREATE FUNCTION get_kitchen_total_orders(p_kitchenID INT)
RETURNS INT
DETERMINISTIC
BEGIN
    DECLARE total INT;
    SELECT COUNT(*) INTO total
    FROM `Order`
    WHERE kitchenID = p_kitchenID;
    RETURN total;
END$$

DELIMITER ;

SELECT get_kitchen_total_orders(1) AS SpiceHubOrders;

DELIMITER $$

CREATE FUNCTION get_most_popular_item()
RETURNS VARCHAR(100)
DETERMINISTIC
BEGIN
    DECLARE item VARCHAR(100);
    SELECT m.itemName INTO item
    FROM OrderDetails od
    JOIN Menu m ON od.menuID = m.menuID
    GROUP BY od.menuID
    ORDER BY SUM(od.quantity) DESC
    LIMIT 1;
    RETURN item;
END$$

DELIMITER ;

SELECT get_most_popular_item() AS MostOrderedItem;

CALL place_new_order(1, 1, 1, 2);
CALL add_payment(1, 'UPI', 400.0);
CALL assign_delivery_partner(1, 1);

