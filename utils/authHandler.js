let jwt = require('jsonwebtoken')
let userModel = require('../schemas/users')

module.exports = {
    checkLogin: async function (req, res, next) {
        let token = req.headers.authorization || req.cookies.token;
        if (!token) {
            return res.status(403).send("Bạn chưa đăng nhập");
        }

        if (token.startsWith("Bearer ")) {
            token = token.split(' ')[1];
        }

        try {
            let result = jwt.verify(token, 'secret');
            if (result && result.exp * 1000 > Date.now()) {
                req.userId = result.id;
                // Fetch user to get their role
                const user = await userModel.findById(req.userId).populate('role');
                if (!user || user.isDeleted) {
                    return res.status(403).send("Người dùng không khả dụng");
                }
                req.user = user;
                next();
            } else {
                res.status(403).send("Token đã hết hạn")
            }
        } catch (error) {
            res.status(403).send("Token không hợp lệ")
        }
    },

    checkRole: function (roles) {
        return function (req, res, next) {
            if (!req.user || !req.user.role) {
                return res.status(403).send("Bạn không có quyền truy cập");
            }
            const userRoleName = req.user.role.name.toLowerCase();
            const allowedRoles = roles.map(r => r.toLowerCase());

            if (allowedRoles.includes(userRoleName)) {
                next();
            } else {
                res.status(403).send("Quyền hạn không đủ");
            }
        }
    }
}