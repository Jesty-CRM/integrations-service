<?php

/**
 * Jesty CRM API Client
 *
 * Handles all communication with Jesty CRM backend
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
	 *
	 * @since    1.0.0
	 * @access   private
	 * @var      string    $api_base_url    The Jesty CRM API base URL.
	 */
	private $api_base_url;

	/**
	 * Integration key
	 *
	 * @since    1.0.0
	 * @access   private
	 * @var      string    $integration_key    The integration key for authentication.
	 */
	private $integration_key;

	/**
	 * Webhook URL
	 *
	 * @since    1.0.0
	 * @access   private
	 * @var      string    $webhook_url    The webhook URL for form submissions.
	 */
	private $webhook_url;

	/**
	 * Initialize the API client
	 *
	 * @since    1.0.0
	 */
	public function __construct() {
		// Use ngrok endpoint for now
		$this->api_base_url = get_option( 'jcrm_api_base_url', 'https://1661e83ca323.ngrok-free.app' );
		$this->integration_key = get_option( 'jcrm_integration_key', '' );
		
		// Build webhook URL
		if ( ! empty( $this->integration_key ) ) {
			$this->webhook_url = $this->api_base_url . '/api/integrations/wordpress/webhook/' . $this->integration_key;
		}
	}

	/**
	 * Send form submission to Jesty CRM backend
	 *
	 * @since    1.0.0
	 * @param    array    $form_data    Form submission data
	 * @return   array                  Result array with success status
	 */
	public function send_form_submission( $form_data ) {
		if ( empty( $this->webhook_url ) ) {
			return array(
				'success' => false,
				'message' => 'Integration key not configured'
			);
		}

		// Prepare the data for Jesty CRM
		$submission_data = array(
			'form_id' => $form_data['form_id'] ?? 'unknown',
			'form_name' => $form_data['form_name'] ?? 'Unknown Form',
			'form_plugin' => $form_data['form_plugin'] ?? 'unknown',
			'submission_data' => $form_data['submission_data'] ?? array(),
			'page_url' => $form_data['page_url'] ?? get_permalink(),
			'site_url' => get_site_url(),
			'timestamp' => current_time( 'mysql' ),
			'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
			'ip_address' => $this->get_client_ip()
		);

		// Auto-map common fields
		$mapped_data = $this->auto_map_fields( $form_data['submission_data'] ?? array() );
		$submission_data = array_merge( $submission_data, $mapped_data );

		$response = wp_remote_post( $this->webhook_url, array(
			'method' => 'POST',
			'timeout' => 30,
			'headers' => array(
				'Content-Type' => 'application/json',
				'User-Agent' => 'Jesty-CRM-WordPress-Plugin/' . JCRM_VERSION,
				'X-WP-Form-ID' => $submission_data['form_id'],
				'X-WP-Form-Name' => $submission_data['form_name'],
				'X-WP-Form-Plugin' => $submission_data['form_plugin'],
				'X-WP-Page-URL' => $submission_data['page_url']
			),
			'body' => wp_json_encode( $submission_data )
		) );

		// Handle response
		if ( is_wp_error( $response ) ) {
			error_log( 'Jesty CRM API Error: ' . $response->get_error_message() );
			return array(
				'success' => false,
				'message' => 'Connection failed: ' . $response->get_error_message()
			);
		}

		$response_code = wp_remote_retrieve_response_code( $response );
		$response_body = wp_remote_retrieve_body( $response );

		if ( $response_code === 200 ) {
			$response_data = json_decode( $response_body, true );
			return array(
				'success' => true,
				'message' => 'Form submission sent successfully',
				'lead_id' => isset( $response_data['leadId'] ) ? $response_data['leadId'] : null,
				'response' => $response_data
			);
		} else {
			error_log( 'Jesty CRM API Error: HTTP ' . $response_code . ' - ' . $response_body );
			return array(
				'success' => false,
				'message' => 'API request failed with status: ' . $response_code,
				'response_code' => $response_code,
				'response_body' => $response_body
			);
		}
	}

	/**
	 * Test connection to Jesty CRM backend
	 *
	 * @since    1.0.0
	 * @return   array    Result array with connection status
	 */
	public function test_connection() {
		if ( empty( $this->integration_key ) ) {
			return array(
				'success' => false,
				'message' => 'Integration key is required'
			);
		}

		$test_url = $this->webhook_url . '/test';

		$test_data = array(
			'test' => true,
			'plugin_version' => JCRM_VERSION,
			'wordpress_version' => get_bloginfo( 'version' ),
			'site_url' => get_site_url(),
			'site_name' => get_bloginfo( 'name' ),
			'timestamp' => current_time( 'mysql' ),
			'form_id' => 'connection_test',
			'form_name' => 'Connection Test',
			'form_plugin' => 'jesty-crm-plugin'
		);

		$response = wp_remote_post( $test_url, array(
			'method' => 'POST',
			'timeout' => 15,
			'headers' => array(
				'Content-Type' => 'application/json',
				'User-Agent' => 'Jesty-CRM-WordPress-Plugin/' . JCRM_VERSION
			),
			'body' => wp_json_encode( $test_data )
		) );

		if ( is_wp_error( $response ) ) {
			return array(
				'success' => false,
				'message' => 'Connection failed: ' . $response->get_error_message()
			);
		}

		$response_code = wp_remote_retrieve_response_code( $response );
		$response_body = wp_remote_retrieve_body( $response );

		if ( $response_code === 200 ) {
			$response_data = json_decode( $response_body, true );
			return array(
				'success' => true,
				'message' => 'Connection successful! Plugin is ready to sync forms.',
				'data' => $response_data
			);
		} else {
			return array(
				'success' => false,
				'message' => 'Connection failed with status: ' . $response_code,
				'response_code' => $response_code,
				'response_body' => $response_body
			);
		}
	}

	/**
	 * Get integration statistics from backend
	 *
	 * @since    1.0.0
	 * @return   array    Statistics data
	 */
	public function get_integration_stats() {
		if ( empty( $this->integration_key ) ) {
			return array( 'error' => 'Integration key not configured' );
		}

		$stats_url = $this->api_base_url . '/api/integrations/wordpress/' . $this->integration_key . '/stats';

		$response = wp_remote_get( $stats_url, array(
			'timeout' => 15,
			'headers' => array(
				'Content-Type' => 'application/json',
				'User-Agent' => 'Jesty-CRM-WordPress-Plugin/' . JCRM_VERSION
			)
		) );

		if ( is_wp_error( $response ) ) {
			return array( 'error' => $response->get_error_message() );
		}

		$response_code = wp_remote_retrieve_response_code( $response );
		if ( $response_code === 200 ) {
			$response_body = wp_remote_retrieve_body( $response );
			return json_decode( $response_body, true );
		} else {
			return array( 'error' => 'Failed to retrieve statistics: HTTP ' . $response_code );
		}
	}

	/**
	 * Auto-map common form fields to CRM fields
	 *
	 * @since    1.0.0
	 * @param    array    $form_data    Raw form data
	 * @return   array                  Mapped data
	 */
	private function auto_map_fields( $form_data ) {
		$mapped = array();

		// Common field mappings
		$field_mappings = array(
			'name_fields' => array( 'name', 'your-name', 'full_name', 'fullname', 'first_name', 'last_name', 'contact_name' ),
			'email_fields' => array( 'email', 'your-email', 'email_address', 'e_mail', 'user_email', 'contact_email' ),
			'phone_fields' => array( 'phone', 'your-phone', 'telephone', 'mobile', 'phone_number', 'contact_number', 'contact_phone' ),
			'message_fields' => array( 'message', 'your-message', 'comments', 'inquiry', 'description', 'details', 'comment' ),
			'company_fields' => array( 'company', 'organization', 'business_name', 'company_name', 'business' ),
			'subject_fields' => array( 'subject', 'your-subject', 'topic', 'title', 'inquiry_type' )
		);

		// Map fields
		foreach ( $form_data as $key => $value ) {
			if ( empty( $value ) ) {
				continue;
			}

			$key_lower = strtolower( $key );

			// Check for name fields
			foreach ( $field_mappings['name_fields'] as $name_field ) {
				if ( strpos( $key_lower, strtolower( $name_field ) ) !== false ) {
					$mapped['lead_name'] = sanitize_text_field( $value );
					break;
				}
			}

			// Check for email fields
			foreach ( $field_mappings['email_fields'] as $email_field ) {
				if ( strpos( $key_lower, strtolower( $email_field ) ) !== false ) {
					$mapped['lead_email'] = sanitize_email( $value );
					break;
				}
			}

			// Check for phone fields
			foreach ( $field_mappings['phone_fields'] as $phone_field ) {
				if ( strpos( $key_lower, strtolower( $phone_field ) ) !== false ) {
					$mapped['lead_phone'] = sanitize_text_field( $value );
					break;
				}
			}

			// Check for message fields
			foreach ( $field_mappings['message_fields'] as $message_field ) {
				if ( strpos( $key_lower, strtolower( $message_field ) ) !== false ) {
					$mapped['lead_message'] = sanitize_textarea_field( $value );
					break;
				}
			}

			// Check for company fields
			foreach ( $field_mappings['company_fields'] as $company_field ) {
				if ( strpos( $key_lower, strtolower( $company_field ) ) !== false ) {
					$mapped['lead_company'] = sanitize_text_field( $value );
					break;
				}
			}

			// Check for subject fields
			foreach ( $field_mappings['subject_fields'] as $subject_field ) {
				if ( strpos( $key_lower, strtolower( $subject_field ) ) !== false ) {
					$mapped['lead_subject'] = sanitize_text_field( $value );
					break;
				}
			}
		}

		return $mapped;
	}

	/**
	 * Get client IP address
	 *
	 * @since    1.0.0
	 * @return   string    Client IP address
	 */
	private function get_client_ip() {
		$ip_keys = array(
			'HTTP_CF_CONNECTING_IP',
			'HTTP_CLIENT_IP',
			'HTTP_X_FORWARDED_FOR',
			'HTTP_X_FORWARDED',
			'HTTP_X_CLUSTER_CLIENT_IP',
			'HTTP_FORWARDED_FOR',
			'HTTP_FORWARDED',
			'REMOTE_ADDR'
		);

		foreach ( $ip_keys as $key ) {
			if ( array_key_exists( $key, $_SERVER ) === true ) {
				foreach ( explode( ',', $_SERVER[ $key ] ) as $ip ) {
					$ip = trim( $ip );
					if ( filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) !== false ) {
						return $ip;
					}
				}
			}
		}

		return $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
	}
}