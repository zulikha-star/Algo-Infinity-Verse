/**
 * scratch/test_heap_3d_visualizer.js
 * Headless test script to verify Min-Heap and Max-Heap operations, sifting,
 * and parent-child index calculations.
 */

class BinaryHeap {
    constructor(type = "min") {
        this.type = type; // "min" or "max"
        this.heap = [];
        this.steps = []; // records swaps for animation tracking
    }

    getParentIndex(i) { return Math.floor((i - 1) / 2); }
    getLeftChildIndex(i) { return 2 * i + 1; }
    getRightChildIndex(i) { return 2 * i + 2; }

    swap(i, j) {
        this.steps.push({ type: "swap", from: i, to: j, valFrom: this.heap[i], valTo: this.heap[j] });
        const temp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = temp;
    }

    compare(i, j) {
        this.steps.push({ type: "compare", index1: i, index2: j, val1: this.heap[i], val2: this.heap[j] });
        if (this.type === "min") {
            return this.heap[i] < this.heap[j];
        } else {
            return this.heap[i] > this.heap[j];
        }
    }

    insert(value) {
        this.steps = [];
        this.heap.push(value);
        this.siftUp(this.heap.length - 1);
        return this.steps; // returns record of steps taken
    }

    siftUp(index) {
        while (index > 0) {
            const parentIdx = this.getParentIndex(index);
            // If child violates heap property with parent, swap
            if (this.compare(index, parentIdx)) {
                this.swap(index, parentIdx);
                index = parentIdx;
            } else {
                break;
            }
        }
    }

    extractRoot() {
        if (this.heap.length === 0) return null;
        this.steps = [];
        
        const root = this.heap[0];
        const last = this.heap.pop();
        
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this.siftDown(0);
        }
        
        return { root, steps: this.steps };
    }

    siftDown(index) {
        const length = this.heap.length;
        while (true) {
            let priorityIdx = index;
            const leftIdx = this.getLeftChildIndex(index);
            const rightIdx = this.getRightChildIndex(index);

            // Compare left child
            if (leftIdx < length && this.compare(leftIdx, priorityIdx)) {
                priorityIdx = leftIdx;
            }

            // Compare right child
            if (rightIdx < length && this.compare(rightIdx, priorityIdx)) {
                priorityIdx = rightIdx;
            }

            // If priority changed, swap and continue
            if (priorityIdx !== index) {
                this.swap(index, priorityIdx);
                index = priorityIdx;
            } else {
                break;
            }
        }
    }
}

// ==========================================
// TEST SUITE
// ==========================================
function runTests() {
    console.log("=== RUNNING BINARY HEAP TESTS ===");

    // Test 1: Index calculations
    (() => {
        console.log("\n--- Test 1: Index Mapping Helpers ---");
        const heap = new BinaryHeap();
        
        console.log(`Parent of index 5: ${heap.getParentIndex(5)} (expected 2)`);
        console.log(`Left child of index 2: ${heap.getLeftChildIndex(2)} (expected 5)`);
        console.log(`Right child of index 2: ${heap.getRightChildIndex(2)} (expected 6)`);
        
        if (heap.getParentIndex(5) !== 2 || heap.getLeftChildIndex(2) !== 5 || heap.getRightChildIndex(2) !== 6) {
            throw new Error("Test 1 Failed: Index calculations are incorrect.");
        }
        console.log("✓ Index mappings verified.");
    })();

    // Test 2: Min-Heap Insertion & Heapify
    (() => {
        console.log("\n--- Test 2: Min-Heap Insertion ---");
        const heap = new BinaryHeap("min");
        
        heap.insert(20);
        heap.insert(10);
        heap.insert(15);
        heap.insert(5);
        heap.insert(8);

        console.log("Min-Heap array structure:", heap.heap);
        // Elements inserted: 20 -> [20]
        // 10 -> [10, 20] (swapped)
        // 15 -> [10, 20, 15]
        // 5 -> [5, 10, 15, 20] (swapped with 20 then 10)
        // 8 -> [5, 8, 15, 20, 10] (swapped with 10)
        // Expected heap array: [5, 8, 15, 20, 10]
        const expected = [5, 8, 15, 20, 10];
        const match = heap.heap.every((val, idx) => val === expected[idx]);
        console.log("Min-Heap matches expected:", match);
        
        if (!match) {
            throw new Error(`Test 2 Failed: Expected ${JSON.stringify(expected)}, got ${JSON.stringify(heap.heap)}`);
        }
        console.log("✓ Min-heap sifting up verified.");
    })();

    // Test 3: Min-Heap Extraction
    (() => {
        console.log("\n--- Test 3: Min-Heap Priority Extraction ---");
        const heap = new BinaryHeap("min");
        [20, 10, 15, 5, 8].forEach(v => heap.insert(v));

        const popped = [];
        while (heap.heap.length > 0) {
            popped.push(heap.extractRoot().root);
        }

        console.log("Popped elements (should be sorted ascending):", popped);
        const sorted = popped.every((val, idx) => idx === 0 || val >= popped[idx - 1]);
        console.log("Is sorted:", sorted);

        if (!sorted || popped.length !== 5) {
            throw new Error("Test 3 Failed: Extraction did not retrieve elements in sorted priority order.");
        }
        console.log("✓ Min-heap priority extraction verified.");
    })();

    // Test 4: Max-Heap Insertion & Extraction
    (() => {
        console.log("\n--- Test 4: Max-Heap Operations ---");
        const heap = new BinaryHeap("max");
        [20, 10, 15, 5, 8].forEach(v => heap.insert(v));

        console.log("Max-Heap array structure:", heap.heap);
        // Expected max-heap: [20, 10, 15, 5, 8]
        // Let's trace inserts:
        // 20 -> [20]
        // 10 -> [20, 10]
        // 15 -> [20, 10, 15]
        // 5  -> [20, 10, 15, 5]
        // 8  -> [20, 10, 15, 5, 8] (no sift-up swaps since parents are always larger)
        const expected = [20, 10, 15, 5, 8];
        const match = heap.heap.every((val, idx) => val === expected[idx]);
        if (!match) {
            throw new Error(`Test 4 Failed (Insert): Expected ${JSON.stringify(expected)}, got ${JSON.stringify(heap.heap)}`);
        }

        const popped = [];
        while (heap.heap.length > 0) {
            popped.push(heap.extractRoot().root);
        }

        console.log("Popped elements (should be sorted descending):", popped);
        const sorted = popped.every((val, idx) => idx === 0 || val <= popped[idx - 1]);
        console.log("Is sorted descending:", sorted);

        if (!sorted || popped.length !== 5) {
            throw new Error("Test 4 Failed (Extract): Max-heap extraction did not retrieve elements in descending priority order.");
        }
        console.log("✓ Max-heap operations verified successfully!");
        console.log("All tests passed successfully!");
    })();
}

runTests();
