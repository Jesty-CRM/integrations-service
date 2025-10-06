<?php

/**
 * The admin-specific functionality of the plugin.
 *
 * @link      https://web.jestycrm.com
 * @since     1.0.0
 *
 * @package    JestyCRM
 * @subpackage JestyCRM/admin
 */

/**
 * The admin-specific functionality of the plugin.
 *
 * Defines the plugin name, version, and handles admin-specific functionality
 * including the admin interface, settings, and form management.
 *
 * @package    JestyCRM
 * @subpackage JestyCRM/admin
 * @author     Jesty CRM Team
 */
class JCRM_Admin {

	/**
	 * The ID of this plugin.
	 *
	 * @since    1.0.0
	 * @access   private
	 * @var      string    $plugin_name    The ID of this plugin.
	 */
	private $plugin_name;

	/**
	 * The version of this plugin.
	 *
	 * @since    1.0.0
	 * @access   private
	 * @var      string    $version    The current version of this plugin.
	 */
	private $version;

	/**
	 * The API client instance.
	 *
	 * @since    1.0.0
	 * @access   private
	 * @var      JCRM_API_Client    $api_client    The API client instance.
	 */
	private $api_client;

	/**
	 * Initialize the class and set its properties.
	 *
	 * @since    1.0.0
	 * @param      string    $plugin_name       The name of this plugin.
	 * @param      string    $version    The version of this plugin.
	 */
	public function __construct( $plugin_name, $version ) {
		$this->plugin_name = $plugin_name;
		$this->version = $version;
		define( 'JCRM_ADMIN_ASSETS_URL', plugin_dir_url( dirname( __FILE__ ) ) . 'admin/' );
		
		// Load API client
		require_once plugin_dir_path( dirname( __FILE__ ) ) . 'includes/class-jesty-crm-api.php';
		$this->api_client = new JCRM_API_Client();
	}

	/**
	 * Static properties for configuration
	 */
	public static $integration_key;
	public static $webhook_url;
	public static $all_pages = array();
	public static $integrated_forms = array();
	public static $has_existing_data = false;

	/**
	 * Register the stylesheets for the admin area.
	 *
	 * @since    1.0.0
	 */
	public function enqueue_styles() {
		wp_enqueue_style( 
			$this->plugin_name, 
			plugin_dir_url( __FILE__ ) . 'css/jesty-crm-admin.css', 
			array(), 
			$this->version, 
			'all' 
		);
	}

	/**
	 * Register the JavaScript for the admin area.
	 *
	 * @since    1.0.0
	 */
	public function enqueue_scripts() {
		wp_enqueue_script( 
			$this->plugin_name, 
			plugin_dir_url( __FILE__ ) . 'js/jesty-crm-admin.js', 
			array( 'jquery' ), 
			$this->version, 
			false 
		);

		// Localize script for AJAX
		wp_localize_script( $this->plugin_name, 'jcrm_ajax_object', array(
			'ajax_url' => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'jcrm_ajax_nonce' ),
			'plugin_url' => JCRM_PLUGIN_URL,
			'assets_url' => JCRM_ADMIN_ASSETS_URL
		));
	}

	/**
	 * Add plugin settings page to admin menu
	 *
	 * @since    1.0.0
	 */
	public function jcrm_add_plugin_settings() {
		add_options_page(
			__( 'Jesty CRM Integration', 'jesty-crm' ),
			__( 'Jesty CRM', 'jesty-crm' ),
			'manage_options',
			JCRM_SETTINGS_SLUG,
			array( $this, 'jcrm_display_admin_page' )
		);
	}

	/**
	 * Initialize admin functionality
	 *
	 * @since    1.0.0
	 */
	public function jcrm_init() {
		// Register settings
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		
		// Load configuration
		self::$integration_key = get_option( 'jcrm_integration_key', '' );
		self::$webhook_url = get_option( 'jcrm_webhook_url', '' );
		
		// Load existing data check
		self::$has_existing_data = !empty( self::$integration_key ) && !empty( self::$webhook_url );
		
		// Load detected forms
		self::$integrated_forms = $this->detect_forms();
		
		// Load all pages
		self::$all_pages = $this->get_all_pages();
	}

	/**
	 * Register plugin settings
	 *
	 * @since    1.0.0
	 */
	public function register_settings() {
		register_setting( 'jcrm_settings_group', 'jcrm_integration_key', array(
			'sanitize_callback' => 'sanitize_text_field'
		) );
		
		register_setting( 'jcrm_settings_group', 'jcrm_webhook_url', array(
			'sanitize_callback' => 'sanitize_url'
		) );
		
		register_setting( 'jcrm_settings_group', 'jcrm_enabled_forms', array(
			'sanitize_callback' => array( $this, 'sanitize_enabled_forms' )
		) );
	}

	/**
	 * Sanitize enabled forms array
	 *
	 * @since    1.0.0
	 * @param    mixed    $input    Input value
	 * @return   array              Sanitized array
	 */
	public function sanitize_enabled_forms( $input ) {
		if ( ! is_array( $input ) ) {
			return array();
		}
		
		return array_map( 'sanitize_text_field', $input );
	}

	/**
	 * Display the admin page
	 *
	 * @since    1.0.0
	 */
	public function jcrm_display_admin_page() {
		include_once plugin_dir_path( __FILE__ ) . 'partials/jesty-crm-admin-display.php';
	}

	/**
	 * Detect available forms on the site
	 *
	 * @since    1.0.0
	 * @return   array    Array of detected forms
	 */
	private function detect_forms() {
		$forms = array();

		// Contact Form 7
		if ( class_exists( 'WPCF7_ContactForm' ) ) {
			$cf7_forms = WPCF7_ContactForm::find( array( 'posts_per_page' => -1 ) );
			foreach ( $cf7_forms as $form ) {
				$forms[] = array(
					'plugin' => 'Contact Form 7',
					'name' => $form->title(),
					'id' => 'cf7_' . $form->id(),
					'form_id' => $form->id(),
					'type' => 'cf7'
				);
			}
		}

		// WPForms
		if ( function_exists( 'wpforms' ) ) {
			$wpforms = get_posts( array(
				'post_type' => 'wpforms',
				'numberposts' => -1,
				'post_status' => 'publish'
			) );
			foreach ( $wpforms as $form ) {
				$forms[] = array(
					'plugin' => 'WPForms',
					'name' => $form->post_title,
					'id' => 'wpforms_' . $form->ID,
					'form_id' => $form->ID,
					'type' => 'wpforms'
				);
			}
		}

		// Ninja Forms
		if ( class_exists( 'Ninja_Forms' ) ) {
			$ninja_forms = Ninja_Forms()->form()->get_forms();
			foreach ( $ninja_forms as $form ) {
				$forms[] = array(
					'plugin' => 'Ninja Forms',
					'name' => $form->get_setting( 'title' ),
					'id' => 'ninja_' . $form->get_id(),
					'form_id' => $form->get_id(),
					'type' => 'ninja'
				);
			}
		}

		// Gravity Forms
		if ( class_exists( 'GFFormsModel' ) ) {
			$gf_forms = GFFormsModel::get_forms();
			foreach ( $gf_forms as $form ) {
				$forms[] = array(
					'plugin' => 'Gravity Forms',
					'name' => $form['title'],
					'id' => 'gf_' . $form['id'],
					'form_id' => $form['id'],
					'type' => 'gravity'
				);
			}
		}

		// Formidable Forms
		if ( class_exists( 'FrmForm' ) ) {
			$frm_forms = FrmForm::get_published_forms();
			foreach ( $frm_forms as $form ) {
				$forms[] = array(
					'plugin' => 'Formidable Forms',
					'name' => $form->name,
					'id' => 'frm_' . $form->id,
					'form_id' => $form->id,
					'type' => 'formidable'
				);
			}
		}

		// Fluent Forms
		if ( class_exists( 'FluentForm\Framework\Foundation\Application' ) ) {
			global $wpdb;
			$fluent_forms = $wpdb->get_results( "SELECT id, title FROM {$wpdb->prefix}fluentform_forms WHERE status = 'published'" );
			foreach ( $fluent_forms as $form ) {
				$forms[] = array(
					'plugin' => 'Fluent Forms',
					'name' => $form->title,
					'id' => 'fluent_' . $form->id,
					'form_id' => $form->id,
					'type' => 'fluent'
				);
			}
		}

		return $forms;
	}

	/**
	 * Get all pages for form detection
	 *
	 * @since    1.0.0
	 * @return   array    Array of all pages
	 */
	private function get_all_pages() {
		$pages = get_pages( array(
			'sort_order' => 'ASC',
			'sort_column' => 'post_title',
			'post_status' => 'publish'
		) );

		$page_list = array();
		foreach ( $pages as $page ) {
			$page_list[] = array(
				'id' => $page->ID,
				'title' => $page->post_title,
				'url' => get_permalink( $page->ID )
			);
		}

		return $page_list;
	}

	/**
	 * Handle AJAX: Save form mappings
	 *
	 * @since    1.0.0
	 */
	public function jcrm_save_mappings() {
		// Check nonce
		if ( ! wp_verify_nonce( $_POST['nonce'], 'jcrm_ajax_nonce' ) ) {
			wp_die( 'Security check failed' );
		}

		// Check capabilities
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Insufficient permissions' );
		}

		$mappings = isset( $_POST['mappings'] ) ? sanitize_text_field( $_POST['mappings'] ) : '';
		$integration_key = isset( $_POST['integration_key'] ) ? sanitize_text_field( $_POST['integration_key'] ) : '';
		$webhook_url = isset( $_POST['webhook_url'] ) ? sanitize_url( $_POST['webhook_url'] ) : '';

		// Save settings
		update_option( 'jcrm_integration_key', $integration_key );
		update_option( 'jcrm_webhook_url', $webhook_url );
		update_option( 'jcrm_form_mappings', $mappings );

		wp_send_json_success( array(
			'message' => __( 'Settings saved successfully', 'jesty-crm' )
		) );
	}

	/**
	 * Handle AJAX: Get form mappings
	 *
	 * @since    1.0.0
	 */
	public function jcrm_get_mappings() {
		// Check nonce
		if ( ! wp_verify_nonce( $_POST['nonce'], 'jcrm_ajax_nonce' ) ) {
			wp_die( 'Security check failed' );
		}

		$mappings = get_option( 'jcrm_form_mappings', '' );
		$integration_key = get_option( 'jcrm_integration_key', '' );
		$webhook_url = get_option( 'jcrm_webhook_url', '' );

		wp_send_json_success( array(
			'mappings' => $mappings,
			'integration_key' => $integration_key,
			'webhook_url' => $webhook_url
		) );
	}

	/**
	 * Handle AJAX: Test connection
	 *
	 * @since    1.0.0
	 */
	public function jcrm_test_connection() {
		// Check nonce
		if ( ! wp_verify_nonce( $_POST['nonce'], 'jcrm_ajax_nonce' ) ) {
			wp_die( 'Security check failed' );
		}

		$integration_key = isset( $_POST['integration_key'] ) ? sanitize_text_field( $_POST['integration_key'] ) : '';
		$webhook_url = isset( $_POST['webhook_url'] ) ? sanitize_url( $_POST['webhook_url'] ) : '';

		if ( empty( $integration_key ) || empty( $webhook_url ) ) {
			wp_send_json_error( __( 'Integration Key and Webhook URL are required', 'jesty-crm' ) );
		}

		// Test data
		$test_data = array(
			'test_field' => 'Test Value',
			'form_id' => 'test',
			'form_name' => 'Connection Test',
			'form_plugin' => 'jesty-crm-plugin',
			'submission_id' => 'test_' . time(),
			'page_url' => home_url(),
			'timestamp' => current_time( 'mysql' )
		);

		$response = wp_remote_post( $webhook_url . '/test', array(
			'body' => wp_json_encode( $test_data ),
			'headers' => array(
				'Content-Type' => 'application/json',
				'X-WP-Form-ID' => 'test',
				'X-WP-Form-Name' => 'Connection Test',
				'X-WP-Form-Plugin' => 'jesty-crm-plugin'
			),
			'timeout' => 30
		) );

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( __( 'Connection failed: ', 'jesty-crm' ) . $response->get_error_message() );
		}

		$response_code = wp_remote_retrieve_response_code( $response );
		if ( $response_code === 200 ) {
			wp_send_json_success( __( 'Connection successful!', 'jesty-crm' ) );
		} else {
			wp_send_json_error( __( 'Connection failed with HTTP code: ', 'jesty-crm' ) . $response_code );
		}
	}

	/**
	 * Handle AJAX: Toggle form sync
	 *
	 * @since    1.0.0
	 */
	public function jcrm_toggle_form() {
		// Check nonce
		if ( ! wp_verify_nonce( $_POST['nonce'], 'jcrm_ajax_nonce' ) ) {
			wp_die( 'Security check failed' );
		}

		$form_id = isset( $_POST['form_id'] ) ? sanitize_text_field( $_POST['form_id'] ) : '';
		$enabled = isset( $_POST['enabled'] ) ? (bool) $_POST['enabled'] : false;

		$enabled_forms = get_option( 'jcrm_enabled_forms', array() );

		if ( $enabled ) {
			if ( ! in_array( $form_id, $enabled_forms ) ) {
				$enabled_forms[] = $form_id;
			}
		} else {
			$enabled_forms = array_diff( $enabled_forms, array( $form_id ) );
		}

		update_option( 'jcrm_enabled_forms', $enabled_forms );

		wp_send_json_success( array(
			'message' => $enabled ? __( 'Form sync enabled', 'jesty-crm' ) : __( 'Form sync disabled', 'jesty-crm' )
		) );
	}

	/**
	 * Handle AJAX: Refresh forms list
	 *
	 * @since    1.0.0
	 */
	public function jcrm_refresh_forms() {
		// Check nonce
		if ( ! wp_verify_nonce( $_POST['nonce'], 'jcrm_ajax_nonce' ) ) {
			wp_die( 'Security check failed' );
		}

		// Clear cached forms
		delete_transient( 'jcrm_detected_forms' );

		// Refresh forms list
		self::$integrated_forms = $this->detect_forms();

		wp_send_json_success( array(
			'message' => __( 'Forms list refreshed', 'jesty-crm' ),
			'forms' => self::$integrated_forms
		) );
	}

	/**
	 * Handle AJAX: Get statistics
	 *
	 * @since    1.0.0
	 */
	public function jcrm_get_stats() {
		// Check nonce
		if ( ! wp_verify_nonce( $_POST['nonce'], 'jcrm_ajax_nonce' ) ) {
			wp_die( 'Security check failed' );
		}

		$database = new JCRM_Database();
		$stats = $database->get_submission_stats();

		wp_send_json_success( $stats );
	}
}