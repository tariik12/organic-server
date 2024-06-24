const express = require('express');
const session = require('express-session');
const mysql = require('mysql');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { promises: fs } = require('fs');
const SSLCommerzPayment = require("sslcommerz-lts");
const util = require('util');
require('dotenv').config();
const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_SECRET;
const is_live = false;
// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Generate a secure random string for session secret
const secureRandomString = crypto.randomBytes(32).toString('hex');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('im'));
app.use(session({
  secret: secureRandomString,
  resave: false,
  saveUninitialized: true,
}));

// Create MySQL connection pool
const pool = mysql.createPool({
  user: "root",
  host: "localhost",
  password: "",
  database: "organic-food",
});

// Middleware for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'im/images');
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

app.post('/register', (req, res) => {
  const {email, name, photo, role   } = req.body;
  const userLogin = "INSERT INTO organic_login ( email, name, photo, role  ) VALUES (?, ?, ?, ?)"  


  pool.query(userLogin, [ email, name, photo, role ], (error, result) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    return res.json({ message: "User registered successfully" });
  });
  
});

app.get('/get-user', (req, res) => {
  const { email } = req.query;
  let sql;
  
  if (email) {
    sql = "SELECT id, email, name, photo, role FROM organic_login WHERE email = ?";
  } else {
    sql = "SELECT id, email, name, photo, role FROM organic_login";
  }

  pool.query(sql, [email], (error, data) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(data);
  });
});

app.patch('/update-user/:id', (req, res) => {
  const { id } = req.params;
  const { newStatus } = req.body;
  const sql = "UPDATE organic_login SET role = ? WHERE id = ?";

  pool.query(sql, [newStatus, id], (error, result) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    return res.json({ message: "User status updated successfully" });
  });
});

// Delete user
app.delete('/delete-user/:id', (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM organic_login WHERE id = ?";

  pool.query(sql, [id], (error, result) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    return res.json({ message: "User deleted successfully" });
  });
});
// Route for uploading a product
app.post('/product-upload', upload.single('productImage'), (req, res) => {
  // Extract product data from request body
  const { productName, parentTitle, type, madeIn, netWeight, price, prePrice, expired, description } = req.body;
  const productImage = req.file.filename;

  // Prepare SQL query
  const sql = "INSERT INTO product (productName, parentTitle, type, madeIn, netWeight, price, prePrice, expired, description, productImage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  const values = [productName, parentTitle, type, madeIn, netWeight, price, prePrice, expired, description, productImage];

  // Execute query
  pool.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error inserting values:", err);
      res.status(500).send("Error inserting values");
    } else {
      res.send("Values inserted");
    }
  });
});


// Route for fetching all products
app.get('/get-product', (req, res) => {
  const sql = "SELECT * FROM product";
  pool.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      res.status(500).send("Error fetching data");
    } else {
      res.json(results);
    }
  });
});
app.get('/get-product-approved', (req, res) => {
  const role ="approved"
  const sql = "SELECT * FROM product where role = ?";
  pool.query(sql,[role], (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      res.status(500).send("Error fetching data");
    } else {
      res.json(results);
    }
  });
});

// Route for fetching a product by ID
app.get('/get-product-by-id/:id', (req, res) => {
  const productId = req.params.id;
  const sql = "SELECT * FROM product WHERE id = ?";
  pool.query(sql, [productId], (err, result) => {
    if (err) {
      console.error("Error fetching data:", err);
      res.status(500).send("Error fetching data");
    } else {
      if (result.length === 0) {
        res.status(404).send("Product not found");
      } else {
        res.json(result[0]);
      }
    }
  });
});

// Route for deleting a product by ID
app.delete('/deleteProduct/:id', async (req, res) => {
  const productId = req.params.id;

  const getProductSql = "SELECT * FROM product WHERE id = ?";
  const getProductValues = [productId];

  pool.query(getProductSql, getProductValues, async (err, results) => {
    if (err) {
      console.log(err);
      res.status(500).send("Error fetching product data");
    } else {
      const product = results[0];
      if (!product) {
        return res.status(404).send("product not found");
      }

      const imagePath = path.join(__dirname, 'im/images', product.productImage);

      try {
        await fs.access(imagePath);
        await fs.unlink(imagePath);
      } catch (unlinkError) {
        console.error("Error deleting image file:", unlinkError);
        res.status(500).send("Error deleting image file");
        return;
      }

      const deleteProductSql = "DELETE FROM product WHERE id = ?";
      const deleteProductValues = [productId];

      pool.query(deleteProductSql, deleteProductValues, (deleteError, deleteResult) => {
        if (deleteError) {
          console.log(deleteError);
          res.status(500).send("Error deleting product");
        } else {
          res.send("Product and image deleted");
        }
      });
    }
  });
});
app.patch('/update-product/:id', upload.fields([{ name: 'productImage', maxCount: 1 }]), async (req, res) => {
  try {
    const productId = req.params.id;
    const {
      productName,
      parentTitle,
      type,
      madeIn,
      netWeight,
      price,
      prePrice,
      expired,
      description,
      role,
    } = req.body;

    const productImage = req.files && req.files['productImage'] ? req.files['productImage'][0].filename : null;

    console.log("Received request to update product:", req.body, req.files, productId);

    const getProductSql = 'SELECT * FROM product WHERE id = ?';
    const getProductValues = [productId];
    pool.query(getProductSql, getProductValues, async (err, results) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error fetching product data");
      } else {
        const existingProduct = results[0];
        if (!existingProduct) {
          return res.status(404).send('Product Not found');
        }
        const existingProductImage = existingProduct.productImage;

        if (productImage && existingProductImage) {
          const imagePath = path.join(__dirname, 'im/images', existingProductImage);
          try {
            await fs.unlink(imagePath); // Delete existing main image file
          } catch (unlinkError) {
            console.error("Error deleting existing main image file:", unlinkError);
            res.status(500).send("Error deleting existing main image file");
            return;
          }
        }

        const setClause = [];
        if (productName) setClause.push('productName = ?');
        if (parentTitle) setClause.push('parentTitle = ?');
        if (type) setClause.push('type = ?');
        if (madeIn) setClause.push('madeIn = ?');
        if (netWeight) setClause.push('netWeight = ?');
        if (price) setClause.push('price = ?');
        if (prePrice) setClause.push('prePrice = ?');
        if (expired) setClause.push('expired = ?');
        if (description) setClause.push('description = ?');
        if (role) setClause.push('role = ?');

        if (productImage) setClause.push('productImage = ?'); // Add productImage to setClause if uploaded

        if (setClause.length === 0) {
          return res.status(400).send("No fields to update");
        }

        const updateSql = `UPDATE product SET ${setClause.join(', ')} WHERE id = ?`;
        const updateValues = [
          ...(productName ? [productName] : []),
          ...(parentTitle ? [parentTitle] : []),
          ...(type ? [type] : []),
          ...(madeIn ? [madeIn] : []),
          ...(price ? [price] : []),
          ...(prePrice ? [prePrice] : []),
          ...(expired ? [expired] : []),
          ...(description ? [description] : []),
          ...(role ? [role] : []),
          ...(productImage ? [productImage] : []), // Add productImage to updateValues if uploaded
          productId,
        ];

        pool.query(updateSql, updateValues, (updateErr, updateResult) => {
          if (updateErr) {
            console.error(updateErr);
            res.status(500).send("Error updating product");
          } else {
            res.send("Product updated");
          }
        });
      }
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).send("Error updating product");
  }
});


// Promisify the pool.query method
pool.query = util.promisify(pool.query);

const generateTransactionId = () => {
  return crypto.randomBytes(16).toString('hex');
};

// Route for handling orders
app.post('/order', async (req, res) => {
  const order = req.body;
  console.log(order);
  const tran_id = generateTransactionId();

  console.log(tran_id);

  const data = {
    total_amount: order.price,
    currency: order.currency,
    tran_id: tran_id,
    success_url: `http://localhost:3000/payment/success/${tran_id}`,
    fail_url: `http://localhost:3000/payment/fail/${tran_id}`,
    cancel_url: 'http://localhost:3000/login',
    ipn_url: 'http://localhost:3000/ipn',
    shipping_method: 'Courier',
    product_name: 'Computer',
    product_category: 'Electronic',
    product_profile: 'general',
    cus_name: order.name,
    cus_email: order.email,
    cus_add1: order.address,
    cus_add2: 'Dhaka',
    cus_city: 'Dhaka',
    cus_state: 'Dhaka',
    cus_postcode: '1000',
    cus_country: 'Bangladesh',
    cus_phone: '01611826146',
    cus_fax: '01708774287',
    ship_name: 'Customer Name',
    ship_add1: 'Dhaka',
    ship_add2: 'Dhaka',
    ship_city: 'Dhaka',
    ship_state: 'Dhaka',
    ship_postcode: 1000,
    ship_country: 'Bangladesh',
  };

  console.log(data);

  const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
  sslcz.init(data).then(apiResponse => {
    let GatewayPageURL = apiResponse.GatewayPageURL;
    console.log(GatewayPageURL);
    res.send({ url: GatewayPageURL });

    const finalOrder = {
      transactionId: tran_id,
      paidStatus: false,
      totalAmount: order.price,
      currency: order.currency,
      name: order.name,
      email:order.email,
      address: order.address,
    };

    const sql = "INSERT INTO orderTable SET ?";
    pool.query(sql, finalOrder, (err, result) => {
      if (err) {
        console.error("Error inserting order record:", err);
      } else {
        console.log("Order record inserted:", result);
      }
    });
  });
});

// Route for handling successful payments
app.post("/payment/success/:tranID", async (req, res) => {
  const tranID = req.params.tranID;

  try {
    const result = await pool.query(
      "UPDATE orderTable SET paidStatus = ? WHERE transactionId = ?",
      [true, tranID]
    );

    if (result.affectedRows > 0) {
      res.redirect(`http://localhost:5173/paymentSuccess/${tranID}`);
    } else {
      res.status(404).send("Transaction ID not found");
    }
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).send("Internal server error");
  }
});

// Route for handling failed payments
app.post("/payment/fail/:tranID", async (req, res) => {
  const tranID = req.params.tranID;

  try {
    const result = await pool.query(
      "DELETE FROM orderTable WHERE transactionId = ?",
      [tranID]
    );

    if (result.affectedRows > 0) {
      res.redirect(`http://localhost:5173/paymentFail/${tranID}`);
    } else {
      res.status(404).send("Transaction ID not found");
    }
  } catch (error) {
    console.error("Error deleting order record:", error);
    res.status(500).send("Internal server error");
  }
});

app.get('/my-bought-product/:email', (req, res) => {
  const registerSql = "SELECT * FROM orderTable WHERE email = ?";
  const email = req.params.email; // Use req.params.username to get the username

  pool.query(registerSql, [email], (error, results) => {
      if (error) {
          return res.status(500).json({ error: "Internal Server Error" });
      }
      if (results.length > 0) {
          res.json(results);
      } else {
          res.status(404).json({ message: "No records with status '' found" });
      }
  });
});

app.get('/api/bought-product-all', (req, res) => {
  const registerSql = "SELECT * FROM orderTable";
  
  pool.query(registerSql, (error, results) => {
      if (error) {
          return res.status(500).json({ error: " Error fetching data" });
      }
      else {
          res.json(results)
      }
  });
});

// Route to check transaction ID
app.get('/api/check-transaction/:tranID', async (req, res) => {
  const tranID = req.params.tranID;

  try {
    const result = await pool.query(
      "SELECT * FROM orderTable WHERE transactionId = ?",
      [tranID]
    );

    if (result.length > 0) {
      res.status(200).send("Transaction found");
    } else {
      res.status(404).send("Transaction ID not found");
    }
  } catch (error) {
    console.error("Error checking transaction ID:", error);
    res.status(500).send("Internal server error");
  }
});


// Route for serving product images
app.get('/images/:imageName', (req, res) => {
  const imageName = req.params.imageName;
  res.sendFile(path.join(__dirname, 'public/images', imageName));
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
