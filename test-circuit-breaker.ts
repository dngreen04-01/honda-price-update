/**
 * Test script for Circuit Breaker functionality
 * Demonstrates how circuit breaker prevents wasting resources on systematic failures
 */

import { CircuitBreaker } from './src/utils/circuit-breaker.js';

// Simulated API call that fails
let callCount = 0;
async function unreliableApiCall(): Promise<string> {
  callCount++;
  console.log(`\n📞 API call #${callCount}`);

  // Fail for first 5 calls, then succeed
  if (callCount <= 5) {
    throw new Error('API service unavailable');
  }

  return 'Success!';
}

async function testCircuitBreaker() {
  console.log('🧪 Testing Circuit Breaker Pattern\n');
  console.log('Scenario: API fails 5 times, then recovers\n');

  const breaker = new CircuitBreaker({
    name: 'Test API',
    failureThreshold: 3,
    resetTimeout: 5000, // 5 seconds
    halfOpenSuccessThreshold: 2,
  });

  // Test 1: Initial failures (CLOSED → OPEN)
  console.log('=== Phase 1: Initial Failures ===');
  for (let i = 1; i <= 4; i++) {
    try {
      await breaker.execute(unreliableApiCall);
    } catch (error) {
      console.log(`❌ Call ${i} failed: ${error instanceof Error ? error.message : error}`);
      console.log(`   Circuit state: ${breaker.getState()}, Failures: ${breaker.getFailureCount()}`);
    }
  }

  // Test 2: Circuit should be OPEN, rejecting immediately
  console.log('\n=== Phase 2: Circuit OPEN (Fail Fast) ===');
  for (let i = 1; i <= 2; i++) {
    try {
      await breaker.execute(unreliableApiCall);
    } catch (error) {
      console.log(`❌ Call rejected: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Test 3: Wait for reset timeout
  console.log('\n=== Phase 3: Waiting for Reset Timeout (5s) ===');
  console.log('⏳ Waiting for circuit to transition to HALF_OPEN...');
  await new Promise(resolve => setTimeout(resolve, 5500));

  // Test 4: HALF_OPEN state (trying recovery)
  console.log('\n=== Phase 4: Recovery Attempt (HALF_OPEN) ===');
  for (let i = 1; i <= 3; i++) {
    try {
      const result = await breaker.execute(unreliableApiCall);
      console.log(`✅ Call ${i} succeeded: ${result}`);
      console.log(`   Circuit state: ${breaker.getState()}`);
    } catch (error) {
      console.log(`❌ Call ${i} failed: ${error instanceof Error ? error.message : error}`);
      console.log(`   Circuit state: ${breaker.getState()}`);
    }
  }

  console.log('\n=== Test Complete ===');
  console.log(`Final circuit state: ${breaker.getState()}`);
  console.log(`Total API calls made: ${callCount} (prevented wasted calls during OPEN state)`);
}

// Run test
testCircuitBreaker().catch(console.error);
