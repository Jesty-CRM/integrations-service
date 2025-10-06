<?php

/**
 * The public-facing functionality of the plugin.
 *
 * @link      https://web.jestycrm.com
 * @since     1.0.0
 *
 * @package    JestyCRM
 * @subpackage JestyCRM/public
 */

/**
 * The public-facing functionality of the plugin.
 *
 * Defines the plugin name, version, and handles public-facing functionality
 * including form submissions and front-end scripts.
 *
 * @package    JestyCRM
 * @subpackage JestyCRM/public
 * @author     Jesty CRM Team
 */
class JCRM_Public {

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
	 * Plugin configuration
	 */
	private $integration_key;
	private $webhook_url;
	private $enabled_forms;
	private $auto_mapping_enabled;
	private $field_mappings;

	/**
	 * Database instance
	 */
	private $database;

	/**
	 * Initialize the class and set its properties.
	 *
	 * @since    1.0.0
	 * @param      string    $plugin_name       The name of the plugin.
	 * @param      string    $version    The version of this plugin.
	 */
	public function __construct( $plugin_name, $version ) {
		$this->plugin_name = $plugin_name;
		$this->version = $version;
		
		// Load API client
		require_once plugin_dir_path( dirname( __FILE__ ) ) . 'includes/class-jesty-crm-api.php';
		$this->api_client = new JCRM_API_Client();

		// Load configuration
		$this->integration_key = get_option( 'jcrm_integration_key', '' );
		$this->webhook_url = get_option( 'jcrm_webhook_url', '' );
		$this->enabled_forms = get_option( 'jcrm_enabled_forms', array() );
		$this->auto_mapping_enabled = get_option( 'jcrm_auto_mapping_enabled', true );
		$this->field_mappings = get_option( 'jcrm_default_field_mappings', array() );

		// Initialize database
		$this->database = new JCRM_Database();
	}

	/**
	 * Register the JavaScript for the public-facing side of the site.
	 *
	 * @since    1.0.0
	 */
	public function jcrm_enqueue_scripts() {
		wp_enqueue_script( 
			$this->plugin_name . '-public', 
			plugin_dir_url( __FILE__ ) . 'js/jesty-crm-public.js', 
			array( 'jquery' ), 
			$this->version, 
			false 
		);

		// Localize script for custom forms
		wp_localize_script( $this->plugin_name . '-public', 'jcrm_public_ajax', array(
			'ajax_url' => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'jcrm_public_nonce' )
		));
	}

	/**
	 * Get stored mappings (filter callback)
	 *
	 * @since    1.0.0
	 */
	public function jcrm_get_stored_mappings( $data ) {
		return array(
			'integration_key' => $this->integration_key,
			'webhook_url' => $this->webhook_url,
			'enabled_forms' => $this->enabled_forms,
			'field_mappings' => $this->field_mappings
		);
	}

	/**
	 * Test connection (filter callback)
	 *
	 * @since    1.0.0
	 */
	public function jcrm_test_connection( $request ) {
		$result = $this->api_client->test_connection();
		
		if ( is_wp_error( $result ) ) {
			return new WP_Error( 'connection_failed', $result->get_error_message(), array( 'status' => 500 ) );
		}

		return rest_ensure_response( array(
			'success' => true,
			'message' => 'Connection successful',
			'data' => $result
		) );
	}

	/**
	 * Save mappings (filter callback)
	 *
	 * @since    1.0.0
	 */
	public function jcrm_save_mappings( $request ) {
		$params = $request->get_params();

		if ( isset( $params['integration_key'] ) ) {
			update_option( 'jcrm_integration_key', sanitize_text_field( $params['integration_key'] ) );
		}

		if ( isset( $params['webhook_url'] ) ) {
			update_option( 'jcrm_webhook_url', sanitize_url( $params['webhook_url'] ) );
		}

		if ( isset( $params['field_mappings'] ) ) {
			update_option( 'jcrm_form_mappings', sanitize_text_field( $params['field_mappings'] ) );
		}

		return rest_ensure_response( array(
			'success' => true,
			'message' => 'Settings saved successfully'
		) );
	}

	/**
	 * Get statistics (filter callback)
	 *
	 * @since    1.0.0
	 */
	public function jcrm_get_stats( $request ) {
		// Get local stats from database
		$period = isset( $request['period'] ) ? sanitize_text_field( $request['period'] ) : '30d';
		$local_stats = $this->database->get_submission_stats( $period );
		
		// Get remote stats from API
		$remote_stats = $this->api_client->get_integration_stats();
		
		// Combine local and remote stats
		$combined_stats = array_merge( $local_stats, array(
			'remote_stats' => $remote_stats
		) );
		
		return $combined_stats;
	}

	/**
	 * Check if form is enabled for sync
	 *
	 * @since    1.0.0
	 * @param    string    $form_id    Form identifier
	 * @return   bool                  True if enabled
	 */
	private function is_form_enabled( $form_id ) {
		return in_array( $form_id, $this->enabled_forms ) || empty( $this->enabled_forms );
	}

	/**
	 * Auto-map form fields to CRM fields
	 *
	 * @since    1.0.0
	 * @param    array     $form_data    Form submission data
	 * @return   array                   Mapped data
	 */
	private function auto_map_fields( $form_data ) {
		if ( ! $this->auto_mapping_enabled ) {
			return $form_data;
		}

		$mapped_data = $form_data;
		$mappings = $this->field_mappings;

		// Auto-detect and map common fields
		foreach ( $form_data as $key => $value ) {
			$key_lower = strtolower( $key );

			// Name fields
			if ( isset( $mappings['name_fields'] ) ) {
				foreach ( $mappings['name_fields'] as $name_field ) {
					if ( strpos( $key_lower, strtolower( $name_field ) ) !== false ) {
						$mapped_data['lead_name'] = $value;
						break;
					}
				}
			}

			// Email fields
			if ( isset( $mappings['email_fields'] ) ) {
				foreach ( $mappings['email_fields'] as $email_field ) {
					if ( strpos( $key_lower, strtolower( $email_field ) ) !== false ) {
						$mapped_data['lead_email'] = $value;
						break;
					}
				}
			}

			// Phone fields
			if ( isset( $mappings['phone_fields'] ) ) {
				foreach ( $mappings['phone_fields'] as $phone_field ) {
					if ( strpos( $key_lower, strtolower( $phone_field ) ) !== false ) {
						$mapped_data['lead_phone'] = $value;
						break;
					}
				}
			}

			// Message fields
			if ( isset( $mappings['message_fields'] ) ) {
				foreach ( $mappings['message_fields'] as $message_field ) {
					if ( strpos( $key_lower, strtolower( $message_field ) ) !== false ) {
						$mapped_data['lead_message'] = $value;
						break;
					}
				}
			}

			// Company fields
			if ( isset( $mappings['company_fields'] ) ) {
				foreach ( $mappings['company_fields'] as $company_field ) {
					if ( strpos( $key_lower, strtolower( $company_field ) ) !== false ) {
						$mapped_data['lead_company'] = $value;
						break;
					}
				}
			}
		}

		return $mapped_data;
	}

	/**
	 * Send data to CRM
	 *
	 * @since    1.0.0
	 * @param    array     $data       Form data
	 * @param    bool      $is_test    Whether this is a test submission
	 * @return   array                 Result array
	 */
	private function send_to_crm( $data, $is_test = false ) {
		// Add metadata
		$data['page_url'] = isset( $_SERVER['HTTP_REFERER'] ) ? $_SERVER['HTTP_REFERER'] : home_url();
		$data['submission_id'] = uniqid( 'wp_' );
		$data['timestamp'] = current_time( 'mysql' );
		$data['site_url'] = home_url();

		// Send via API client
		$result = $this->api_client->send_lead( $data );

		// Log submission
		$log_data = array(
			'form_id' => isset( $data['form_id'] ) ? $data['form_id'] : 'unknown',
			'form_plugin' => isset( $data['form_plugin'] ) ? $data['form_plugin'] : 'unknown',
			'form_name' => isset( $data['form_name'] ) ? $data['form_name'] : 'Unknown Form',
			'submission_data' => $data,
			'status' => 'pending'
		);

		if ( is_wp_error( $result ) ) {
			$log_data['status'] = 'failed';
			$log_data['error_message'] = $result->get_error_message();
			$this->database->log_submission( $log_data );

			// Update statistics
			$this->update_stats( false );

			return array(
				'success' => false,
				'message' => $result->get_error_message()
			);
		}

		$log_data['status'] = 'success';
		if ( isset( $result['leadId'] ) ) {
			$log_data['crm_lead_id'] = $result['leadId'];
		}
		$this->database->log_submission( $log_data );

		// Update statistics
		$this->update_stats( true );

		return array(
			'success' => true,
			'message' => 'Submission sent successfully',
			'lead_id' => isset( $result['leadId'] ) ? $result['leadId'] : null,
			'result' => $result
		);
	}

	/**
	 * Update submission statistics
	 *
	 * @since    1.0.0
	 * @param    bool      $success    Whether submission was successful
	 */
	private function update_stats( $success ) {
		$stats = get_option( 'jcrm_submission_stats', array(
			'total_submissions' => 0,
			'successful_submissions' => 0,
			'failed_submissions' => 0,
			'last_submission' => null
		) );

		$stats['total_submissions']++;
		if ( $success ) {
			$stats['successful_submissions']++;
		} else {
			$stats['failed_submissions']++;
		}
		$stats['last_submission'] = time();

		update_option( 'jcrm_submission_stats', $stats );
	}

	/**
	 * Contact Form 7 submission handler
	 *
	 * @since    1.0.0
	 * @param    WPCF7_ContactForm    $contact_form    Contact form object
	 */
	public function jcrm_send_cf7_data( $contact_form ) {
		if ( ! $this->is_form_enabled( 'cf7_' . $contact_form->id() ) ) {
			return;
		}

		$submission = WPCF7_Submission::get_instance();
		if ( ! $submission ) {
			return;
		}

		$data = $submission->get_posted_data();
		$data['form_id'] = $contact_form->id();
		$data['form_name'] = $contact_form->title();
		$data['form_plugin'] = 'contact-form-7';

		$mapped_data = $this->auto_map_fields( $data );
		$this->send_to_crm( $mapped_data );
	}

	/**
	 * WPForms submission handler
	 *
	 * @since    1.0.0
	 */
	public function jcrm_send_wpform_data( $fields, $entry, $form_data, $entry_id ) {
		if ( ! $this->is_form_enabled( 'wpforms_' . $form_data['id'] ) ) {
			return;
		}

		$data = array();
		foreach ( $fields as $field ) {
			$data[ $field['name'] ] = $field['value'];
		}

		$data['form_id'] = $form_data['id'];
		$data['form_name'] = $form_data['settings']['form_title'];
		$data['form_plugin'] = 'wpforms';
		$data['entry_id'] = $entry_id;

		$mapped_data = $this->auto_map_fields( $data );
		$this->send_to_crm( $mapped_data );
	}

	/**
	 * Ninja Forms submission handler
	 *
	 * @since    1.0.0
	 */
	public function jcrm_send_ninja_form_data( $form_data ) {
		$form_id = $form_data['form_id'];

		if ( ! $this->is_form_enabled( 'ninja_' . $form_id ) ) {
			return;
		}

		$data = array();
		foreach ( $form_data['fields'] as $field ) {
			$data[ $field['key'] ] = $field['value'];
		}

		$form = Ninja_Forms()->form( $form_id )->get();
		$data['form_id'] = $form_id;
		$data['form_name'] = $form->get_setting( 'title' );
		$data['form_plugin'] = 'ninja-forms';

		$mapped_data = $this->auto_map_fields( $data );
		$this->send_to_crm( $mapped_data );
	}

	/**
	 * Gravity Forms submission handler
	 *
	 * @since    1.0.0
	 */
	public function jcrm_send_gravity_data( $entry, $form ) {
		if ( ! $this->is_form_enabled( 'gf_' . $form['id'] ) ) {
			return;
		}

		$data = array();
		foreach ( $form['fields'] as $field ) {
			$data[ $field->label ] = rgar( $entry, $field->id );
		}

		$data['form_id'] = $form['id'];
		$data['form_name'] = $form['title'];
		$data['form_plugin'] = 'gravity-forms';
		$data['entry_id'] = $entry['id'];

		$mapped_data = $this->auto_map_fields( $data );
		$this->send_to_crm( $mapped_data );
	}

	/**
	 * Elementor Forms submission handler
	 *
	 * @since    1.0.0
	 */
	public function jcrm_send_elementor_form_data( $record, $handler ) {
		$form_name = $record->get_form_settings( 'form_name' );
		$form_id = $record->get_form_settings( 'id' );

		if ( ! $this->is_form_enabled( 'elementor_' . $form_id ) ) {
			return;
		}

		$data = $record->get( 'fields' );
		$data['form_id'] = $form_id;
		$data['form_name'] = $form_name;
		$data['form_plugin'] = 'elementor-forms';

		$mapped_data = $this->auto_map_fields( $data );
		$this->send_to_crm( $mapped_data );
	}

	/**
	 * Formidable Forms submission handler
	 *
	 * @since    1.0.0
	 */
	public function jcrm_send_formidable_data( $entry_id, $form_id ) {
		if ( ! $this->is_form_enabled( 'frm_' . $form_id ) ) {
			return;
		}

		$entry = FrmEntry::getOne( $entry_id, true );
		$form = FrmForm::getOne( $form_id );

		$data = array();
		foreach ( $entry->metas as $field_id => $value ) {
			$field = FrmField::getOne( $field_id );
			if ( $field ) {
				$data[ $field->name ] = $value;
			}
		}

		$data['form_id'] = $form_id;
		$data['form_name'] = $form->name;
		$data['form_plugin'] = 'formidable-forms';
		$data['entry_id'] = $entry_id;

		$mapped_data = $this->auto_map_fields( $data );
		$this->send_to_crm( $mapped_data );
	}

	/**
	 * Fluent Forms submission handler
	 *
	 * @since    1.0.0
	 */
	public function jcrm_send_fluent_data( $insertId, $formData, $form ) {
		if ( ! $this->is_form_enabled( 'fluent_' . $form->id ) ) {
			return;
		}

		$data = $formData;
		$data['form_id'] = $form->id;
		$data['form_name'] = $form->title;
		$data['form_plugin'] = 'fluent-forms';
		$data['entry_id'] = $insertId;

		$mapped_data = $this->auto_map_fields( $data );
		$this->send_to_crm( $mapped_data );
	}

	/**
	 * Everest Forms submission handler
	 *
	 * @since    1.0.0
	 */
	public function jcrm_send_everest_form_data( $form_id, $form_data, $entry_id, $form_obj, $form_fields ) {
		if ( ! $this->is_form_enabled( 'everest_' . $form_id ) ) {
			return;
		}

		$data = $form_data;
		$data['form_id'] = $form_id;
		$data['form_name'] = get_the_title( $form_id );
		$data['form_plugin'] = 'everest-forms';
		$data['entry_id'] = $entry_id;

		$mapped_data = $this->auto_map_fields( $data );
		$this->send_to_crm( $mapped_data );
	}

	/**
	 * Forminator submission handler
	 *
	 * @since    1.0.0
	 */
	public function jcrm_send_forminator_data( $entry, $form_id, $field_data_array ) {
		if ( ! $this->is_form_enabled( 'forminator_' . $form_id ) ) {
			return;
		}

		$data = array();
		foreach ( $field_data_array as $field ) {
			$data[ $field['name'] ] = $field['value'];
		}

		$form = Forminator_API::get_form( $form_id );
		$data['form_id'] = $form_id;
		$data['form_name'] = $form->settings['formName'];
		$data['form_plugin'] = 'forminator';

		$mapped_data = $this->auto_map_fields( $data );
		$this->send_to_crm( $mapped_data );
	}

	/**
	 * MetForm submission handler
	 *
	 * @since    1.0.0
	 */
	public function jcrm_submit_metform_data( $form_id, $form_data, $map_data, $form_settings ) {
		if ( ! $this->is_form_enabled( 'metform_' . $form_id ) ) {
			return;
		}

		$data = $form_data;
		$data['form_id'] = $form_id;
		$data['form_name'] = get_the_title( $form_id );
		$data['form_plugin'] = 'metform';

		$mapped_data = $this->auto_map_fields( $data );
		$this->send_to_crm( $mapped_data );
	}
}