<?php

/**
 * Jesty CRM API Client
 *
 * Handles all communication with Jesty CRM backend using API key authentication
 *
 * @link       https://jesty-crm.vercel.app
 * @since      1.0.0
 *
 * @package    JestyCRM
 * @subpackage JestyCRM/includes
 */

/**
 * API Client for communicating with Jesty CRM backend
 *
 * @since      1.0.0
 * @package    JestyCRM
 * @subpackage JestyCRM/includes
 * @author     Jesty CRM Team
 */
class JCRM_API_Client {

	/**
	 * API base URL
	 */
	private $api_base_url;

	/**
	 * API key for authentication
	 */
	private $api_key;

	/**
	 * Request timeout
	 */
	private $timeout;

	/**
	 * User agent string
	 */
	private $user_agent;

	/**
	 * Initialize the API client
	 */
	public function __construct() {
		$this->api_base_url = get_option('jcrm_api_base_url', 'https://1661e83ca323.ngrok-free.app');
		$this->api_key = get_option('jcrm_api_key', '');
		$this->timeout = 30;
		$this->user_agent = 'Jesty CRM WordPress Plugin/' . JCRM_VERSION;
	}

	/**
	 * Send lead data to Jesty CRM
	 * 
	 * @param array $lead_data Lead information
	 * @return array|WP_Error Response data or error
	 */
	public function send_lead($lead_data) {
		if (empty($this->api_key)) {
			return new WP_Error('no_api_key', 'API key is required. Please configure your integration.');
		}

		$endpoint = $this->api_base_url . '/api/wordpress/webhook';
		
		// Add WordPress metadata
		$lead_data = array_merge($lead_data, array(
			'api_key' => $this->api_key,
			'site_url' => home_url(),
			'plugin_version' => JCRM_VERSION,
			'wordpress_version' => get_bloginfo('version'),
			'timestamp' => current_time('mysql'),
		));
		
		$args = array(
			'method' => 'POST',
			'timeout' => $this->timeout,
			'headers' => array(
				'Content-Type' => 'application/json',
				'User-Agent' => $this->user_agent,
				'X-API-Key' => $this->api_key,
				'X-WP-Form-ID' => isset($lead_data['form_id']) ? $lead_data['form_id'] : '',
				'X-WP-Form-Name' => isset($lead_data['form_name']) ? $lead_data['form_name'] : '',
				'X-WP-Form-Plugin' => isset($lead_data['source']) ? $lead_data['source'] : '',
				'X-WP-Page-URL' => isset($lead_data['url']) ? $lead_data['url'] : '',
			),
			'body' => wp_json_encode($lead_data),
			'sslverify' => false, // For ngrok development
		);
		
		$response = wp_remote_post($endpoint, $args);
		
		if (is_wp_error($response)) {
			error_log('Jesty CRM API Error: ' . $response->get_error_message());
			return $response;
		}
		
		$response_code = wp_remote_retrieve_response_code($response);
		$response_body = wp_remote_retrieve_body($response);
		
		if ($response_code !== 200) {
			$error_message = 'HTTP ' . $response_code;
			if (!empty($response_body)) {
				$decoded = json_decode($response_body, true);
				if (isset($decoded['message'])) {
					$error_message .= ': ' . $decoded['message'];
				}
			}
			error_log('Jesty CRM API Error: ' . $error_message);
			return new WP_Error('api_error', $error_message);
		}
		
		$decoded_response = json_decode($response_body, true);
		if (json_last_error() !== JSON_ERROR_NONE) {
			return new WP_Error('invalid_response', 'Invalid JSON response from API');
		}
		
		// Log successful submission
		error_log('Jesty CRM Lead submitted successfully: ' . $response_body);
		
		return $decoded_response;
	}

	/**
	 * Test connection to Jesty CRM API
	 * 
	 * @return array|WP_Error Test result or error
	 */
	public function test_connection() {
		if (empty($this->api_key)) {
			return new WP_Error('no_api_key', 'API key is required. Please configure your integration.');
		}

		$endpoint = $this->api_base_url . '/api/wordpress/webhook/test';
		
		$test_data = array(
			'test' => true,
			'api_key' => $this->api_key,
			'name' => 'Test Connection',
			'email' => 'test@example.com',
			'message' => 'This is a connection test from WordPress plugin',
			'source' => 'WordPress Plugin Test',
			'site_url' => home_url(),
			'plugin_version' => JCRM_VERSION,
			'wordpress_version' => get_bloginfo('version'),
			'timestamp' => current_time('mysql'),
		);
		
		$args = array(
			'method' => 'POST',
			'timeout' => $this->timeout,
			'headers' => array(
				'Content-Type' => 'application/json',
				'User-Agent' => $this->user_agent,
				'X-API-Key' => $this->api_key,
			),
			'body' => wp_json_encode($test_data),
			'sslverify' => false, // For ngrok development
		);
		
		$response = wp_remote_post($endpoint, $args);
		
		if (is_wp_error($response)) {
			return new WP_Error('connection_failed', 'Connection test failed: ' . $response->get_error_message());
		}
		
		$response_code = wp_remote_retrieve_response_code($response);
		$response_body = wp_remote_retrieve_body($response);
		
		if ($response_code !== 200) {
			$error_message = 'HTTP ' . $response_code;
			if (!empty($response_body)) {
				$decoded = json_decode($response_body, true);
				if (isset($decoded['message'])) {
					$error_message .= ': ' . $decoded['message'];
				}
			}
			return new WP_Error('connection_failed', 'Connection test failed: ' . $error_message);
		}
		
		$decoded_response = json_decode($response_body, true);
		if (json_last_error() !== JSON_ERROR_NONE) {
			return new WP_Error('invalid_response', 'Invalid response from API');
		}
		
		return $decoded_response;
	}

	/**
	 * Get integration statistics from Jesty CRM
	 * 
	 * @return array|WP_Error Statistics data or error
	 */
	public function get_integration_stats() {
		if (empty($this->api_key)) {
			return new WP_Error('no_api_key', 'API key is required. Please configure your integration.');
		}

		$endpoint = $this->api_base_url . '/api/wordpress/validate-api-key/' . $this->api_key;
		
		$args = array(
			'method' => 'GET',
			'timeout' => $this->timeout,
			'headers' => array(
				'User-Agent' => $this->user_agent,
				'X-API-Key' => $this->api_key,
			),
			'sslverify' => false, // For ngrok development
		);
		
		$response = wp_remote_get($endpoint, $args);
		
		if (is_wp_error($response)) {
			return $response;
		}
		
		$response_code = wp_remote_retrieve_response_code($response);
		$response_body = wp_remote_retrieve_body($response);
		
		if ($response_code !== 200) {
			return array(
				'connected' => false,
				'message' => 'Failed to get statistics'
			);
		}
		
		$decoded_response = json_decode($response_body, true);
		if (json_last_error() !== JSON_ERROR_NONE) {
			return array(
				'connected' => false,
				'message' => 'Invalid response format'
			);
		}
		
		return $decoded_response;
	}

	/**
	 * Validate API key and configure plugin
	 * 
	 * @param string $api_key API key to validate
	 * @return array|WP_Error Validation result or error
	 */
	public function validate_and_configure($api_key) {
		if (empty($api_key)) {
			return new WP_Error('no_api_key', 'API key is required.');
		}

		$endpoint = $this->api_base_url . '/api/wordpress/validate-api-key/' . $api_key;
		
		$args = array(
			'method' => 'GET',
			'timeout' => $this->timeout,
			'headers' => array(
				'User-Agent' => $this->user_agent,
			),
			'sslverify' => false, // For ngrok development
		);
		
		$response = wp_remote_get($endpoint, $args);
		
		if (is_wp_error($response)) {
			return new WP_Error('validation_failed', 'API key validation failed: ' . $response->get_error_message());
		}
		
		$response_code = wp_remote_retrieve_response_code($response);
		$response_body = wp_remote_retrieve_body($response);
		
		if ($response_code !== 200) {
			return new WP_Error('invalid_api_key', 'Invalid API key.');
		}
		
		$decoded_response = json_decode($response_body, true);
		if (json_last_error() !== JSON_ERROR_NONE) {
			return new WP_Error('invalid_response', 'Invalid response from API');
		}

		if (!$decoded_response['success']) {
			return new WP_Error('invalid_api_key', $decoded_response['message'] ?? 'Invalid API key.');
		}

		// Save API key and configure plugin
		update_option('jcrm_api_key', $api_key);
		update_option('jcrm_integration_configured', true);
		
		// Now confirm configuration with backend
		$this->confirm_plugin_configuration($api_key, $decoded_response['data']);
		
		return $decoded_response;
	}

	/**
	 * Confirm plugin configuration with backend
	 * 
	 * @param string $api_key API key
	 * @param array $integration_data Integration data from validation
	 * @return array|WP_Error Configuration result or error
	 */
	private function confirm_plugin_configuration($api_key, $integration_data) {
		$endpoint = $this->api_base_url . '/api/wordpress/plugin/configure/' . $api_key;
		
		// Detect available forms
		$forms = $this->detect_forms();
		
		$config_data = array(
			'siteUrl' => home_url(),
			'pluginVersion' => JCRM_VERSION,
			'wordpressVersion' => get_bloginfo('version'),
			'forms' => $forms
		);
		
		$args = array(
			'method' => 'POST',
			'timeout' => $this->timeout,
			'headers' => array(
				'Content-Type' => 'application/json',
				'User-Agent' => $this->user_agent,
			),
			'body' => wp_json_encode($config_data),
			'sslverify' => false, // For ngrok development
		);
		
		$response = wp_remote_post($endpoint, $args);
		
		if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
			update_option('jcrm_integration_connected', true);
			error_log('Jesty CRM plugin configuration confirmed successfully');
		}
		
		return $response;
	}

	/**
	 * Detect available forms on the site
	 * 
	 * @return array List of detected forms
	 */
	private function detect_forms() {
		$forms = array();
		
		// Contact Form 7
		if (class_exists('WPCF7_ContactForm')) {
			$cf7_forms = get_posts(array(
				'post_type' => 'wpcf7_contact_form',
				'numberposts' => -1
			));
			foreach ($cf7_forms as $form) {
				$forms[] = array(
					'id' => $form->ID,
					'name' => $form->post_title,
					'plugin' => 'contact-form-7'
				);
			}
		}
		
		// WPForms
		if (function_exists('wpforms')) {
			$wpforms = get_posts(array(
				'post_type' => 'wpforms',
				'numberposts' => -1
			));
			foreach ($wpforms as $form) {
				$forms[] = array(
					'id' => $form->ID,
					'name' => $form->post_title,
					'plugin' => 'wpforms'
				);
			}
		}
		
		// Gravity Forms
		if (class_exists('GFForms')) {
			$gf_forms = \GFFormsModel::get_forms();
			foreach ($gf_forms as $form) {
				$forms[] = array(
					'id' => $form->id,
					'name' => $form->title,
					'plugin' => 'gravity-forms'
				);
			}
		}
		
		// Ninja Forms
		if (class_exists('Ninja_Forms')) {
			$nf_forms = Ninja_Forms()->form()->get_forms();
			foreach ($nf_forms as $form) {
				$forms[] = array(
					'id' => $form->get_id(),
					'name' => $form->get_setting('title'),
					'plugin' => 'ninja-forms'
				);
			}
		}
		
		return $forms;
	}

	/**
	 * Get client IP address
	 * 
	 * @return string Client IP address
	 */
	private function get_client_ip() {
		$ip = '';
		
		if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
			$ip = $_SERVER['HTTP_CLIENT_IP'];
		} elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
			$ip = $_SERVER['HTTP_X_FORWARDED_FOR'];
		} else {
			$ip = $_SERVER['REMOTE_ADDR'];
		}
		
		return sanitize_text_field($ip);
	}

	/**
	 * Auto-map form fields to CRM fields
	 * 
	 * @param array $form_data Form submission data
	 * @return array Mapped data
	 */
	private function auto_map_fields($form_data) {
		$mapped = array();
		
		// Common field mappings
		$field_mappings = array(
			'email' => array('email', 'your-email', 'user_email', 'contact_email', 'your_email'),
			'name' => array('name', 'your-name', 'full_name', 'contact_name', 'your_name', 'first_name'),
			'phone' => array('phone', 'your-phone', 'phone_number', 'contact_phone', 'your_phone', 'tel'),
			'message' => array('message', 'your-message', 'comments', 'description', 'your_message'),
			'company' => array('company', 'company_name', 'organization', 'business_name')
		);
		
		foreach ($field_mappings as $crm_field => $wp_fields) {
			foreach ($wp_fields as $wp_field) {
				if (isset($form_data[$wp_field]) && !empty($form_data[$wp_field])) {
					$mapped[$crm_field] = sanitize_text_field($form_data[$wp_field]);
					break;
				}
			}
		}
		
		return $mapped;
	}
}