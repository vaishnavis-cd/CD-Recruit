import { ModuleType } from "@prisma/client";

export interface McqContent {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface McqSeedEntry {
  moduleType: Extract<ModuleType, "MCQ">;
  content: McqContent;
}

export const mcqQuestions: McqSeedEntry[] = [
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "In the JavaScript/Node.js event loop, which of the following is executed first after the current synchronous execution stack is cleared?",
      options: [
        "setTimeout callbacks",
        "setImmediate callbacks",
        "process.nextTick callbacks",
        "I/O polling events",
      ],
      correctIndex: 2,
      explanation:
        "process.nextTick callbacks are executed immediately after the current operation completes, before the event loop continues to any other phases, including microtasks and macrotasks (like setTimeout).",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "What is the primary benefit of the B-Tree index structure over a Hash index structure in relational databases like PostgreSQL?",
      options: [
        "Faster single-value lookups (O(1) complexity)",
        "Support for range queries and sorting operations",
        "Smaller memory footprint on disk",
        "Lock-free concurrent writes",
      ],
      correctIndex: 1,
      explanation:
        "B-Tree indexes maintain sorted order of keys, allowing efficient range scans, sorting (ORDER BY), and inequality comparison operators (<, <=, >, >=). Hash indexes only support equality comparisons (=).",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "In TypeScript, what utility type would you use to construct a type consisting of all properties of type T, except those in the union key K?",
      options: ["Exclude<T, K>", "Omit<T, K>", "Pick<T, K>", "Extract<T, K>"],
      correctIndex: 1,
      explanation:
        "Omit<T, K> constructs a new type by picking all properties from T and then removing keys K. Exclude is used for union types, not object properties.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "Under the PostgreSQL 'READ COMMITTED' transaction isolation level, which of the following anomalies is still possible?",
      options: [
        "Dirty Read",
        "Non-repeatable Read",
        "Lost Update",
        "Phantom Read only (Non-repeatable read is prevented)",
      ],
      correctIndex: 1,
      explanation:
        "READ COMMITTED prevents dirty reads, but allows non-repeatable reads (where a row retrieved twice within the same transaction can have different values because another committed transaction modified it) and phantom reads.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "What is the security risk of storing JWT session tokens in localStorage instead of a secure, httpOnly cookie?",
      options: [
        "Cross-Site Request Forgery (CSRF)",
        "Cross-Site Scripting (XSS) session theft",
        "Man-in-the-Middle (MitM) sniffing",
        "SQL Injection",
      ],
      correctIndex: 1,
      explanation:
        "localStorage is accessible via client-side JavaScript. If a website has an XSS vulnerability, an attacker can execute script to read and steal the JWT. Cookies with the httpOnly flag cannot be accessed by client-side JS.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "Which HTTP status code is most appropriate for a request that fails authentication (e.g. missing or invalid API key)?",
      options: [
        "400 Bad Request",
        "401 Unauthorized",
        "403 Forbidden",
        "404 Not Found",
      ],
      correctIndex: 1,
      explanation:
        "401 Unauthorized is the standard HTTP status code for authentication failures, meaning the user is not recognized or credentials are invalid. 403 Forbidden is used when the identity is known but lacks permissions.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "In CSS, what is the result of applying 'box-sizing: border-box' to an element?",
      options: [
        "Padding and border are included in the element's total width and height.",
        "Margin and padding are included in the element's total width and height.",
        "The element behaves as an inline block regardless of display settings.",
        "The browser ignores custom width and height declarations.",
      ],
      correctIndex: 0,
      explanation:
        "With border-box, the specified width and height properties include the content, padding, and border, making layouts much easier to manage.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "What is the difference between Git merge and Git rebase when integrating changes from a feature branch back to main?",
      options: [
        "Merge deletes the branch history, whereas rebase preserves it.",
        "Merge creates a new commit representing the integration, while rebase rewrites the commit history by applying local commits on top of main.",
        "Rebase is always safer because it doesn't modify existing commit hashes.",
        "Merge can only be done locally, while rebase must be executed on the remote origin.",
      ],
      correctIndex: 1,
      explanation:
        "Git merge creates a new merge commit preserving branch lines. Git rebase moves the entire feature branch to begin on the tip of the main branch, rewriting history with new commit hashes for a linear timeline.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "What is the worst-case time complexity of searching for an element in a balanced Binary Search Tree (e.g., AVL or Red-Black Tree) containing N elements?",
      options: ["O(1)", "O(log N)", "O(N)", "O(N log N)"],
      correctIndex: 1,
      explanation:
        "In a balanced BST, the height of the tree is bounded by log N. Because each step down the tree halves the remaining search space, the worst-case search complexity is O(log N).",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "How does the 'this' keyword behave inside an ES6 arrow function?",
      options: [
        "It refers to the element that triggered the execution event.",
        "It is dynamically bound to the object that invoked the function at runtime.",
        "It is lexically bound, inheriting the value of 'this' from its enclosing execution context.",
        "It is undefined unless explicitly bound using .bind() or .call().",
      ],
      correctIndex: 2,
      explanation:
        "Arrow functions do not define their own 'this' binding. They capture the 'this' value of the enclosing lexical context in which they were created.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "When designing a REST API, which HTTP method is recommended for partial updates to an existing resource?",
      options: ["PUT", "PATCH", "POST", "UPDATE"],
      correctIndex: 1,
      explanation:
        "PATCH is specifically designed for partial updates to resources. PUT is intended for full replacements, and POST is generally for creating resources.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "What does the Single Responsibility Principle (SRP) in SOLID design recommend?",
      options: [
        "An application should perform only one main function.",
        "A class or module should have one, and only one, reason to change.",
        "All functions should accept a maximum of one parameter.",
        "Microservices should be restricted to running a single database transaction at a time.",
      ],
      correctIndex: 1,
      explanation:
        "SRP states that a class, module, or function should have only one reason to change, meaning it should perform a single well-defined set of responsibilities.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "What is the difference between a Docker image and a Docker container?",
      options: [
        "An image is a running instance of a container.",
        "Containers are stored on registries like Docker Hub, while images only exist locally.",
        "An image is a read-only template with instructions for creating a container; a container is a runnable instance of an image.",
        "Images represent compiled binaries, while containers are the source code folders.",
      ],
      correctIndex: 2,
      explanation:
        "Docker images are static, immutable blueprint files containing OS files, dependencies, and configuration. Containers are isolated, active running instances of those blueprints.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "How does the Same-Origin Policy (SOP) treat cross-origin resource requests between http://example.com and https://example.com?",
      options: [
        "They are considered same-origin because the hostnames are identical.",
        "They are considered cross-origin because the protocols (HTTP vs HTTPS) differ.",
        "They are considered same-origin as long as the port is the same.",
        "SOP does not apply to protocol variations.",
      ],
      correctIndex: 1,
      explanation:
        "Two URLs have the same origin if and only if their protocol, host (domain), and port are identical. In this case, the protocols are different, so they are cross-origin.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "What is the primary benefit of using database connection pooling in backend applications?",
      options: [
        "It automatically indexes slow queries.",
        "It encrypts all traffic between the database and the backend.",
        "It avoids the overhead of repeatedly establishing and closing TCP connections for every database operation.",
        "It replicates data to read replicas asynchronously.",
      ],
      correctIndex: 2,
      explanation:
        "Establishing database connections involves expensive TCP handshakes and database authentication. A pool maintains active connections and leases them to requests, reducing latency and resource consumption.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "Which of the following describes horizontal scaling (scaling out)?",
      options: [
        "Adding more CPU or RAM to an existing database server.",
        "Adding more instances of a stateless application behind a load balancer.",
        "Refactoring code to use asynchronous multi-threading.",
        "Migrating database tables to a denormalized schema.",
      ],
      correctIndex: 1,
      explanation:
        "Horizontal scaling involves adding more machine instances/nodes to distribute load, as opposed to vertical scaling (scaling up), which increases resources (CPU/RAM) on a single machine.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "In a microservices architecture, what pattern is used to query data across multiple services by listening to domain events and building a read-optimized view model?",
      options: [
        "CQRS (Command Query Responsibility Segregation)",
        "API Gateway Routing",
        "Saga Orchestration",
        "Circuit Breaker",
      ],
      correctIndex: 0,
      explanation:
        "CQRS segregates commands (writes) from queries (reads). By utilizing event-driven synchronization, read-optimized views can be queried independently without doing distributed joins across microservice databases.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "What is the purpose of the 'Content-Security-Policy' (CSP) HTTP header?",
      options: [
        "To negotiate the content format (JSON/XML) between client and server.",
        "To enforce HTTPS encryption for all website assets.",
        "To mitigate Cross-Site Scripting (XSS) and data injection attacks by restricting where assets can be loaded from.",
        "To cache static pages on regional CDN edge nodes.",
      ],
      correctIndex: 2,
      explanation:
        "CSP is a security standard header that instructs the browser which source domains are allowed to load/execute script, stylesheets, images, etc., preventing unauthorized script execution via XSS.",
    },
  },
  {
    moduleType: "MCQ",
    content: {
      prompt:
        "In Node.js, what is the behavior of blocking I/O methods like 'fs.readFileSync'?",
      options: [
        "They execute in a separate worker thread background loop.",
        "They block the single main execution thread, stopping all other code execution and concurrent requests until the file read completes.",
        "They automatically use promises under the hood.",
        "They throw an error if the file size exceeds 1MB.",
      ],
      correctIndex: 1,
      explanation:
        "Since Node.js is single-threaded, synchronous methods block the event loop entirely, preventing any other event processing, callbacks, or incoming HTTP requests from being processed until the operation finishes.",
    },
  },
];
