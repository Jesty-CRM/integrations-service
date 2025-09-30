<?php
/**
 * Test script to verify Jesty CRM plugin integration
 */

// Test API client connection
require_once 'jesty-crm-plugin/includes/class-jesty-crm-api.php';

// Create API client instance
$api_client = new JCRM_API_Client();

echo "Testing Jesty CRM API Connection...\n\n";

// Test connection
echo "1. Testing connection to ngrok endpoint...\n";
$connection_result = $api_client->test_connection();

if (is_wp_error($connection_result)) {
    echo "❌ Connection test failed: " . $connection_result->get_error_message() . "\n";
} else {
    echo "✅ Connection test successful!\n";
    echo "Response: " . json_encode($connection_result, JSON_PRETTY_PRINT) . "\n";
}

echo "\n";

// Test lead submission
echo "2. Testing lead submission...\n";
$test_lead_data = array(
    'name' => 'Test User',
    'email' => 'test@example.com',
    'message' => 'This is a test lead from WordPress plugin',
    'source' => 'WordPress Plugin Test',
    'form_id' => 'test_form_001',
    'url' => 'https://example.com/test-page',
    'user_agent' => 'Test Agent',
    'ip_address' => '127.0.0.1'
);

$lead_result = $api_client->send_lead($test_lead_data);

if (is_wp_error($lead_result)) {
    echo "❌ Lead submission failed: " . $lead_result->get_error_message() . "\n";
} else {
    echo "✅ Lead submitted successfully!\n";
    echo "Response: " . json_encode($lead_result, JSON_PRETTY_PRINT) . "\n";
}

echo "\n";

// Test stats retrieval
echo "3. Testing stats retrieval...\n";
$stats_result = $api_client->get_integration_stats();

if (is_wp_error($stats_result)) {
    echo "❌ Stats retrieval failed: " . $stats_result->get_error_message() . "\n";
} else {
    echo "✅ Stats retrieved successfully!\n";
    echo "Response: " . json_encode($stats_result, JSON_PRETTY_PRINT) . "\n";
}

echo "\nTest completed!\n";