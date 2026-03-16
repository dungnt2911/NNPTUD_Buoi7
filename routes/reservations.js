var express = require('express');
var router = express.Router();
let reservationModel = require('../schemas/reservations');
let cartModel = require('../schemas/carts');
let inventoryModel = require('../schemas/inventories');
let productModel = require('../schemas/products');
const { default: mongoose } = require('mongoose');

let { checkLogin } = require('../utils/authHandler.js');

// get all cua user -> get reservations/
router.get('/', checkLogin, async function (req, res, next) {
    try {
        let reservations = await reservationModel.find({ user: req.userId }).populate('items.product');
        res.send(reservations);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});

// get 1 cua user -> get reservations/:id
router.get('/:id', checkLogin, async function (req, res, next) {
    try {
        let reservation = await reservationModel.findOne({
            _id: req.params.id,
            user: req.userId
        }).populate('items.product');
        if (!reservation) {
            return res.status(404).send({ message: "Reservation not found" });
        }
        res.send(reservation);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});

// reserveACart -> post reserveACart/
router.post('/reserveACart', checkLogin, async function (req, res, next) {
    let session = await mongoose.startSession();
    let transaction = session.startTransaction();
    try {
        let cart = await cartModel.findOne({ user: req.userId }).session(session);
        if (!cart || cart.items.length === 0) {
            throw new Error("Cart is empty or not found");
        }

        let totalAmount = 0;
        let reservationItems = [];

        for (let i = 0; i < cart.items.length; i++) {
            let item = cart.items[i];
            let product = await productModel.findById(item.product).session(session);
            if (!product) {
                throw new Error("Product not found");
            }

            let inventory = await inventoryModel.findOne({ product: item.product }).session(session);
            if (!inventory || (inventory.stock - inventory.reserved) < item.quantity) {
                throw new Error("Not enough stock for product " + product.title);
            }

            // Increase reserved amount
            inventory.reserved += item.quantity;
            await inventory.save({ session });

            let subtotal = product.price * item.quantity;
            totalAmount += subtotal;

            reservationItems.push({
                product: product._id,
                quantity: item.quantity,
                price: product.price,
                subtotal: subtotal
            });
        }

        let newReservation = new reservationModel({
            user: req.userId,
            items: reservationItems,
            totalAmount: totalAmount,
            status: "actived"
        });

        await newReservation.save({ session });

        // Empty cart
        cart.items = [];
        await cart.save({ session });

        await session.commitTransaction();
        session.endSession();
        res.send(newReservation);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).send({ message: error.message });
    }
});

// reserveItems -> post reserveItems/ {body gồm list product va quantity}
router.post('/reserveItems', checkLogin, async function (req, res, next) {
    let session = await mongoose.startSession();
    let transaction = session.startTransaction();
    try {
        let items = req.body; // Expecting an array of {product, quantity}
        if (!Array.isArray(items) || items.length === 0) {
            // Check if it's passed as req.body.items
            if (req.body.items && Array.isArray(req.body.items) && req.body.items.length > 0) {
                items = req.body.items;
            } else {
                throw new Error("Invalid items data");
            }
        }

        let totalAmount = 0;
        let reservationItems = [];

        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let product = await productModel.findById(item.product).session(session);
            if (!product) {
                throw new Error("Product not found");
            }

            let inventory = await inventoryModel.findOne({ product: item.product }).session(session);
            if (!inventory || (inventory.stock - inventory.reserved) < item.quantity) {
                throw new Error("Not enough stock for product " + product.title);
            }

            // Increase reserved amount
            inventory.reserved += item.quantity;
            await inventory.save({ session });

            let subtotal = product.price * item.quantity;
            totalAmount += subtotal;

            reservationItems.push({
                product: product._id,
                quantity: item.quantity,
                price: product.price,
                subtotal: subtotal
            });
        }

        let newReservation = new reservationModel({
            user: req.userId,
            items: reservationItems,
            totalAmount: totalAmount,
            status: "actived"
        });

        await newReservation.save({ session });

        await session.commitTransaction();
        session.endSession();
        res.send(newReservation);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).send({ message: error.message });
    }
});

// cancelReserve -> post cancelReserve/:id
router.post('/cancelReserve/:id', checkLogin, async function (req, res, next) {
    try {
        let reservation = await reservationModel.findOne({
            _id: req.params.id,
            user: req.userId
        });

        if (!reservation) {
            return res.status(404).send({ message: "Reservation not found" });
        }

        if (reservation.status !== "actived") {
            return res.status(400).send({ message: "Can only cancel active reservations" });
        }

        reservation.status = "cancelled";

        // Restore inventory (decrease reserved)
        for (let i = 0; i < reservation.items.length; i++) {
            let item = reservation.items[i];
            let inventory = await inventoryModel.findOne({ product: item.product });
            if (inventory) {
                if (inventory.reserved >= item.quantity) {
                    inventory.reserved -= item.quantity;
                } else {
                    inventory.reserved = 0; // fallback just in case
                }
                await inventory.save();
            }
        }

        await reservation.save();
        res.send(reservation);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});

module.exports = router;
