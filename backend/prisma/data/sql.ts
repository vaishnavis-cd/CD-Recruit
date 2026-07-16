import { ModuleType } from "@prisma/client";

export interface SqlContent {
  prompt: string;
  schema: string;
  seedData: string;
  expectedQuery?: string;
  explanation?: string;
}

export interface SqlSeedEntry {
  moduleType: Extract<ModuleType, "SQL">;
  content: SqlContent;
}

export const sqlQuestions: SqlSeedEntry[] = [
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Write a query to retrieve the names of all employees who earn more than the average salary of their respective departments.",
      schema: `
        CREATE TABLE departments (
          id INT PRIMARY KEY,
          name VARCHAR(50)
        );
        CREATE TABLE employees (
          id INT PRIMARY KEY,
          name VARCHAR(50),
          salary DECIMAL(10, 2),
          department_id INT REFERENCES departments(id)
        );
      `,
      seedData: `
        INSERT INTO departments VALUES (1, 'Engineering'), (2, 'Sales'), (3, 'HR');
        INSERT INTO employees VALUES 
          (1, 'Alice', 95000.00, 1),
          (2, 'Bob', 80000.00, 1),
          (3, 'Charlie', 110000.00, 1),
          (4, 'David', 60000.00, 2),
          (5, 'Eve', 75000.00, 2),
          (6, 'Frank', 50000.00, 3);
      `,
      expectedQuery: `
        SELECT e.name 
        FROM employees e
        WHERE e.salary > (
          SELECT AVG(sub.salary) 
          FROM employees sub 
          WHERE sub.department_id = e.department_id
        );
      `,
      explanation:
        "A correlated subquery or a JOIN with an aggregated subquery matches each employee's salary against the average salary for their department.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Find all users who registered in the last 30 days (relative to '2026-07-14') and have placed at least 3 orders. Return user_id, email, and the order count.",
      schema: `
        CREATE TABLE users (
          id INT PRIMARY KEY,
          email VARCHAR(100),
          created_at DATE
        );
        CREATE TABLE orders (
          id INT PRIMARY KEY,
          user_id INT REFERENCES users(id),
          ordered_at DATE
        );
      `,
      seedData: `
        INSERT INTO users VALUES 
          (1, 'user1@test.com', '2026-07-01'),
          (2, 'user2@test.com', '2026-06-01'),
          (3, 'user3@test.com', '2026-07-10'),
          (4, 'user4@test.com', '2026-07-05');
        INSERT INTO orders VALUES
          (101, 1, '2026-07-02'), (102, 1, '2026-07-03'), (103, 1, '2026-07-04'),
          (104, 2, '2026-06-05'), (105, 2, '2026-06-10'), (106, 2, '2026-06-15'),
          (107, 3, '2026-07-11'), (108, 3, '2026-07-12'),
          (109, 4, '2026-07-06'), (110, 4, '2026-07-07'), (111, 4, '2026-07-08'), (112, 4, '2026-07-09');
      `,
      expectedQuery: `
        SELECT u.id AS user_id, u.email, COUNT(o.id) AS order_count
        FROM users u
        JOIN orders o ON u.id = o.user_id
        WHERE u.created_at >= '2026-07-14'::date - INTERVAL '30 days'
        GROUP BY u.id, u.email
        HAVING COUNT(o.id) >= 3;
      `,
      explanation:
        "Filters users using a date interval comparison, groups by user fields, and applies HAVING COUNT(o.id) >= 3 to filter group aggregations.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "For each order, calculate the running total of sales revenue by transaction date. Return order_id, transaction_date, amount, and running_total.",
      schema: `
        CREATE TABLE sales (
          id INT PRIMARY KEY,
          amount DECIMAL(12, 2),
          transaction_date DATE
        );
      `,
      seedData: `
        INSERT INTO sales VALUES 
          (1, 150.00, '2026-07-01'),
          (2, 200.00, '2026-07-02'),
          (3, 50.00, '2026-07-03'),
          (4, 300.00, '2026-07-04');
      `,
      expectedQuery: `
        SELECT id AS order_id, transaction_date, amount,
               SUM(amount) OVER (ORDER BY transaction_date, id) AS running_total
        FROM sales
        ORDER BY transaction_date, id;
      `,
      explanation:
        "Uses the SUM window function OVER an ordered partition of transaction dates to produce a cumulative running total.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Identify duplicate email addresses in the candidates table. Return the email and the duplicate count, sorted by count descending.",
      schema: `
        CREATE TABLE candidates (
          id INT PRIMARY KEY,
          email VARCHAR(100)
        );
      `,
      seedData: `
        INSERT INTO candidates VALUES 
          (1, 'alice@test.com'),
          (2, 'bob@test.com'),
          (3, 'alice@test.com'),
          (4, 'charlie@test.com'),
          (5, 'bob@test.com'),
          (6, 'bob@test.com');
      `,
      expectedQuery: `
        SELECT email, COUNT(*) AS duplicate_count
        FROM candidates
        GROUP BY email
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC;
      `,
      explanation:
        "Groups by email, filters with HAVING count > 1, and orders by count descending.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Find the second highest salary from the employees table. Return a single column and row named second_highest_salary. If no second highest salary exists, return NULL.",
      schema: `
        CREATE TABLE employees (
          id INT PRIMARY KEY,
          salary DECIMAL(10, 2)
        );
      `,
      seedData: `
        INSERT INTO employees VALUES (1, 90000.00), (2, 90000.00), (3, 80000.00), (4, 110000.00);
      `,
      expectedQuery: `
        SELECT MAX(salary) AS second_highest_salary
        FROM employees
        WHERE salary < (SELECT MAX(salary) FROM employees);
      `,
      explanation:
        "Using a subquery to find the absolute max, and selecting the max salary that is strictly less than that value yields the second highest salary (handles ties correctly).",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Retrieve the top 3 selling products by total revenue. Return product_id, name, and total_revenue.",
      schema: `
        CREATE TABLE products (
          id INT PRIMARY KEY,
          name VARCHAR(100)
        );
        CREATE TABLE order_items (
          id INT PRIMARY KEY,
          product_id INT REFERENCES products(id),
          quantity INT,
          price_per_unit DECIMAL(10, 2)
        );
      `,
      seedData: `
        INSERT INTO products VALUES (1, 'Laptop'), (2, 'Mouse'), (3, 'Keyboard'), (4, 'Monitor');
        INSERT INTO order_items VALUES 
          (10, 1, 2, 1000.00),
          (11, 2, 5, 25.00),
          (12, 3, 3, 75.00),
          (13, 1, 1, 1000.00),
          (14, 4, 4, 250.00);
      `,
      expectedQuery: `
        SELECT p.id AS product_id, p.name, SUM(oi.quantity * oi.price_per_unit) AS total_revenue
        FROM products p
        JOIN order_items oi ON p.id = oi.product_id
        GROUP BY p.id, p.name
        ORDER BY total_revenue DESC
        LIMIT 3;
      `,
      explanation:
        "Multiplies quantity and price, groups by product, orders by total sum descending, and limits results to 3.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "List all projects and the count of employees assigned to each. Include projects that have no employees assigned. Sort by employee count descending.",
      schema: `
        CREATE TABLE projects (
          id INT PRIMARY KEY,
          name VARCHAR(100)
        );
        CREATE TABLE project_assignments (
          project_id INT REFERENCES projects(id),
          employee_id INT
        );
      `,
      seedData: `
        INSERT INTO projects VALUES (1, 'Project Alpha'), (2, 'Project Beta'), (3, 'Project Gamma');
        INSERT INTO project_assignments VALUES (1, 101), (1, 102), (2, 103);
      `,
      expectedQuery: `
        SELECT p.name, COUNT(pa.employee_id) AS employee_count
        FROM projects p
        LEFT JOIN project_assignments pa ON p.id = pa.project_id
        GROUP BY p.id, p.name
        ORDER BY employee_count DESC;
      `,
      explanation:
        "Uses a LEFT JOIN to ensure projects with zero assignments are not omitted, aggregating count of employee IDs rather than COUNT(*).",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Find all employees who report directly to a manager who reports to the CEO (represented by manager_id IS NULL). Do not list the CEO or the immediate managers themselves.",
      schema: `
        CREATE TABLE employees (
          id INT PRIMARY KEY,
          name VARCHAR(50),
          manager_id INT
        );
      `,
      seedData: `
        INSERT INTO employees VALUES 
          (1, 'CEO Arthur', NULL),
          (2, 'Manager Beatrice', 1),
          (3, 'Manager Charles', 1),
          (4, 'Dev Daniel', 2),
          (5, 'Dev Ethan', 2),
          (6, 'Dev Frank', 3),
          (7, 'Intern Grace', 4);
      `,
      expectedQuery: `
        SELECT name
        FROM employees
        WHERE manager_id IN (
          SELECT id 
          FROM employees 
          WHERE manager_id = (SELECT id FROM employees WHERE manager_id IS NULL)
        );
      `,
      explanation:
        "Retrieves employees whose manager's manager is the node with no parent (the CEO).",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Calculate the net price of each order item, considering item discount and an order-wide shipping cost distributed evenly across items. Return order_id, item_id, and final_net_price.",
      schema: `
        CREATE TABLE orders (
          id INT PRIMARY KEY,
          shipping_cost DECIMAL(10, 2)
        );
        CREATE TABLE order_items (
          id INT PRIMARY KEY,
          order_id INT REFERENCES orders(id),
          price DECIMAL(10, 2),
          discount DECIMAL(10, 2)
        );
      `,
      seedData: `
        INSERT INTO orders VALUES (1, 15.00), (2, 5.00);
        INSERT INTO order_items VALUES 
          (101, 1, 100.00, 10.00),
          (102, 1, 50.00, 0.00),
          (103, 1, 30.00, 5.00),
          (104, 2, 20.00, 0.00);
      `,
      expectedQuery: `
        WITH item_counts AS (
          SELECT order_id, COUNT(*) AS item_count
          FROM order_items
          GROUP BY order_id
        )
        SELECT oi.order_id, oi.id AS item_id,
               (oi.price - oi.discount + (o.shipping_cost / ic.item_count)) AS final_net_price
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN item_counts ic ON oi.order_id = ic.order_id;
      `,
      explanation:
        "Uses a CTE to count items per order, then joins to distribute the shipping cost proportionally and apply item discount.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Find all customers who bought product 'A' but have never bought product 'B'. Return customer_id.",
      schema: `
        CREATE TABLE sales (
          customer_id INT,
          product_name VARCHAR(10)
        );
      `,
      seedData: `
        INSERT INTO sales VALUES 
          (1, 'A'), (1, 'B'),
          (2, 'A'),
          (3, 'C'),
          (4, 'A'), (4, 'C');
      `,
      expectedQuery: `
        SELECT DISTINCT customer_id
        FROM sales
        WHERE product_name = 'A'
        EXCEPT
        SELECT DISTINCT customer_id
        FROM sales
        WHERE product_name = 'B';
      `,
      explanation:
        "Uses EXCEPT to select customers who bought 'A' and subtract those who bought 'B'.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Compute the rolling 3-day total order value for each date in the dataset. Return order_date and rolling_total.",
      schema: `
        CREATE TABLE daily_sales (
          order_date DATE PRIMARY KEY,
          total_amount DECIMAL(12, 2)
        );
      `,
      seedData: `
        INSERT INTO daily_sales VALUES 
          ('2026-07-01', 1000.00),
          ('2026-07-02', 1500.00),
          ('2026-07-03', 800.00),
          ('2026-07-04', 2000.00),
          ('2026-07-05', 1200.00);
      `,
      expectedQuery: `
        SELECT order_date,
               SUM(total_amount) OVER (
                 ORDER BY order_date
                 ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
               ) AS rolling_total
        FROM daily_sales;
      `,
      explanation:
        "Applies a sliding window frame of 'ROWS BETWEEN 2 PRECEDING AND CURRENT ROW' ordered by date to calculate a rolling 3-day total.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Find the department name that has the highest cumulative salary expense. Return department name and total_salary.",
      schema: `
        CREATE TABLE departments (
          id INT PRIMARY KEY,
          name VARCHAR(50)
        );
        CREATE TABLE employees (
          id INT PRIMARY KEY,
          salary DECIMAL(10, 2),
          department_id INT REFERENCES departments(id)
        );
      `,
      seedData: `
        INSERT INTO departments VALUES (1, 'Engineering'), (2, 'Sales');
        INSERT INTO employees VALUES 
          (1, 90000.00, 1), (2, 85000.00, 1),
          (3, 100000.00, 2), (4, 70000.00, 2);
      `,
      expectedQuery: `
        SELECT d.name, SUM(e.salary) AS total_salary
        FROM departments d
        JOIN employees e ON d.id = e.department_id
        GROUP BY d.id, d.name
        ORDER BY total_salary DESC
        LIMIT 1;
      `,
      explanation:
        "Groups employees by department, computes the sum, orders descending, and takes the first row.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Using a recursive CTE, construct the full file path for every node in the folder system. Return folder_id, path (e.g. '/root/documents/reports').",
      schema: `
        CREATE TABLE folders (
          id INT PRIMARY KEY,
          name VARCHAR(50),
          parent_id INT REFERENCES folders(id)
        );
      `,
      seedData: `
        INSERT INTO folders VALUES 
          (1, 'root', NULL),
          (2, 'documents', 1),
          (3, 'images', 1),
          (4, 'reports', 2),
          (5, 'vacation', 3);
      `,
      expectedQuery: `
        WITH RECURSIVE folder_path AS (
          SELECT id, name, parent_id, CAST('/' || name AS VARCHAR(255)) AS path
          FROM folders
          WHERE parent_id IS NULL
          UNION ALL
          SELECT f.id, f.name, f.parent_id, CAST(fp.path || '/' || f.name AS VARCHAR(255))
          FROM folders f
          JOIN folder_path fp ON f.parent_id = fp.id
        )
        SELECT id AS folder_id, path FROM folder_path;
      `,
      explanation:
        "Applies a recursive CTE joining folders with their parent's path calculations to build the absolute path string.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Find all overlapping video session entries. Two sessions overlap if they belong to the same candidate and their timelines intersect. Return session_a_id and session_b_id where session_a_id < session_b_id.",
      schema: `
        CREATE TABLE test_sessions (
          id INT PRIMARY KEY,
          candidate_id INT,
          start_time TIMESTAMP,
          end_time TIMESTAMP
        );
      `,
      seedData: `
        INSERT INTO test_sessions VALUES 
          (1, 100, '2026-07-14 10:00:00', '2026-07-14 11:00:00'),
          (2, 100, '2026-07-14 10:30:00', '2026-07-14 11:30:00'),
          (3, 100, '2026-07-14 12:00:00', '2026-07-14 13:00:00'),
          (4, 200, '2026-07-14 10:00:00', '2026-07-14 11:00:00');
      `,
      expectedQuery: `
        SELECT s1.id AS session_a_id, s2.id AS session_b_id
        FROM test_sessions s1
        JOIN test_sessions s2 ON s1.candidate_id = s2.candidate_id AND s1.id < s2.id
        WHERE s1.start_time < s2.end_time AND s2.start_time < s1.end_time;
      `,
      explanation:
        "Joins session table with itself on identical candidate IDs, enforcing overlap query logic: s1.start < s2.end AND s2.start < s1.end.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Find the percentage of orders that resulted in a returns status, grouped by customer region. Return region and return_percentage.",
      schema: `
        CREATE TABLE customers (
          id INT PRIMARY KEY,
          region VARCHAR(20)
        );
        CREATE TABLE orders (
          id INT PRIMARY KEY,
          customer_id INT REFERENCES customers(id),
          status VARCHAR(20)
        );
      `,
      seedData: `
        INSERT INTO customers VALUES (1, 'North'), (2, 'North'), (3, 'South'), (4, 'South');
        INSERT INTO orders VALUES 
          (10, 1, 'DELIVERED'), (11, 1, 'RETURNED'),
          (12, 2, 'DELIVERED'),
          (13, 3, 'RETURNED'), (14, 3, 'RETURNED'),
          (15, 4, 'DELIVERED');
      `,
      expectedQuery: `
        SELECT c.region,
               ROUND(100.0 * COUNT(CASE WHEN o.status = 'RETURNED' THEN 1 END) / COUNT(o.id), 2) AS return_percentage
        FROM customers c
        JOIN orders o ON c.id = o.customer_id
        GROUP BY c.region;
      `,
      explanation:
        "Aggregates return counts using conditional CASE statements and divides by the total orders within each grouped region.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Compute Month-Over-Month growth rate in active users. Return month (as format 'YYYY-MM') and growth_rate (as percentage with 2 decimals).",
      schema: `
        CREATE TABLE user_activity (
          user_id INT,
          active_date DATE
        );
      `,
      seedData: `
        INSERT INTO user_activity VALUES 
          (1, '2026-05-15'), (2, '2026-05-20'),
          (1, '2026-06-01'), (2, '2026-06-15'), (3, '2026-06-20'),
          (1, '2026-07-01'), (4, '2026-07-02');
      `,
      expectedQuery: `
        WITH monthly_actives AS (
          SELECT TO_CHAR(active_date, 'YYYY-MM') AS month,
                 COUNT(DISTINCT user_id) AS active_count
          FROM user_activity
          GROUP BY TO_CHAR(active_date, 'YYYY-MM')
        ),
        lagged_actives AS (
          SELECT month, active_count,
                 LAG(active_count) OVER (ORDER BY month) AS prev_active_count
          FROM monthly_actives
        )
        SELECT month,
               ROUND(100.0 * (active_count - prev_active_count) / prev_active_count, 2) AS growth_rate
        FROM lagged_actives
        WHERE prev_active_count IS NOT NULL;
      `,
      explanation:
        "Utilizes window function LAG to reference the previous month's unique active users count and computes the percentage change.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Find the items that are currently out of stock (quantity = 0) but have a backorder quantity greater than 0. Sort by backorder quantity descending.",
      schema: `
        CREATE TABLE inventory (
          item_id INT PRIMARY KEY,
          quantity INT,
          backorder_quantity INT
        );
      `,
      seedData: `
        INSERT INTO inventory VALUES 
          (1, 10, 0),
          (2, 0, 50),
          (3, 0, 0),
          (4, 0, 120);
      `,
      expectedQuery: `
        SELECT item_id, backorder_quantity
        FROM inventory
        WHERE quantity = 0 AND backorder_quantity > 0
        ORDER BY backorder_quantity DESC;
      `,
      explanation:
        "Filters for zero inventory count and positive backorders, sorting by backorders descending.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Identify the high-value customers who spent a total of more than $1000.00 across all orders. Return customer_id and total_spent.",
      schema: `
        CREATE TABLE orders (
          id INT PRIMARY KEY,
          customer_id INT,
          order_total DECIMAL(10, 2)
        );
      `,
      seedData: `
        INSERT INTO orders VALUES 
          (1, 10, 500.00), (2, 10, 600.00),
          (3, 11, 950.00),
          (4, 12, 1200.00);
      `,
      expectedQuery: `
        SELECT customer_id, SUM(order_total) AS total_spent
        FROM orders
        GROUP BY customer_id
        HAVING SUM(order_total) > 1000.00
        ORDER BY total_spent DESC;
      `,
      explanation:
        "Groups orders by customer ID, calculates aggregate totals, filters with HAVING total > 1000, and orders descending.",
    },
  },
  {
    moduleType: "SQL",
    content: {
      prompt:
        "Write a query to identify candidates who had consecutive daily logins of 3 or more days. Return candidate_id.",
      schema: `
        CREATE TABLE logins (
          candidate_id INT,
          login_date DATE
        );
      `,
      seedData: `
        INSERT INTO logins VALUES 
          (1, '2026-07-01'), (1, '2026-07-02'), (1, '2026-07-03'),
          (2, '2026-07-01'), (2, '2026-07-03'), (2, '2026-07-04'),
          (3, '2026-07-01'), (3, '2026-07-02');
      `,
      expectedQuery: `
        WITH ranked_logins AS (
          SELECT DISTINCT candidate_id, login_date,
                 login_date - CAST(ROW_NUMBER() OVER (PARTITION BY candidate_id ORDER BY login_date) AS INT) AS grp
          FROM logins
        )
        SELECT DISTINCT candidate_id
        FROM ranked_logins
        GROUP BY candidate_id, grp
        HAVING COUNT(*) >= 3;
      `,
      explanation:
        "Finds consecutive dates by partitioning logins per candidate, subtracting a sequential row number from each date to get a constant reference date block ('grp'), and grouping by this block.",
    },
  },
];
