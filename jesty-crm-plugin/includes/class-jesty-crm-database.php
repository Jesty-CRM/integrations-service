<?php

/**
 * Database operations for the plugin
 *
 * @link       https://web.jestycrm.com
 * @since      1.0.0
 *
 * @package    JestyCRM
 * @subpackage JestyCRM/includes
 */

/**
 * Database operations for the plugin.
 *
 * This class defines all database-related functionality for the plugin.
 *
 * @since      1.0.0
 * @package    JestyCRM
 * @subpackage JestyCRM/includes
 * @author     Jesty CRM Team
 */
class JCRM_Database {

	/**
	 * Create plugin tables if needed
	 *
	 * @since    1.0.0
	 */
	public function create_tables() {
		global $wpdb;

		$charset_collate = $wpdb->get_charset_collate();

		// Table for storing form submissions log
		$table_name = $wpdb->prefix . 'jcrm_submissions';

		$sql = "CREATE TABLE $table_name (
			id mediumint(9) NOT NULL AUTO_INCREMENT,
			form_id varchar(100) NOT NULL,
			form_plugin varchar(50) NOT NULL,
			form_name varchar(255) NOT NULL,
			submission_data longtext NOT NULL,
			status varchar(20) NOT NULL DEFAULT 'pending',
			error_message text,
			crm_lead_id varchar(100),
			submitted_at datetime DEFAULT CURRENT_TIMESTAMP,
			processed_at datetime,
			PRIMARY KEY (id),
			KEY form_id (form_id),
			KEY status (status),
			KEY submitted_at (submitted_at)
		) $charset_collate;";

		require_once( ABSPATH . 'wp-admin/includes/upgrade.php' );
		dbDelta( $sql );

		// Update database version
		update_option( 'jcrm_db_version', JCRM_VERSION );
	}

	/**
	 * Log form submission
	 *
	 * @since    1.0.0
	 * @param    array    $data    Submission data
	 * @return   int|false         Insert ID on success, false on failure
	 */
	public function log_submission( $data ) {
		global $wpdb;

		$table_name = $wpdb->prefix . 'jcrm_submissions';

		$result = $wpdb->insert(
			$table_name,
			array(
				'form_id' => $data['form_id'],
				'form_plugin' => $data['form_plugin'],
				'form_name' => $data['form_name'],
				'submission_data' => wp_json_encode( $data['submission_data'] ),
				'status' => $data['status'],
				'error_message' => isset( $data['error_message'] ) ? $data['error_message'] : '',
				'crm_lead_id' => isset( $data['crm_lead_id'] ) ? $data['crm_lead_id'] : '',
				'submitted_at' => current_time( 'mysql' )
			),
			array(
				'%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s'
			)
		);

		return $result ? $wpdb->insert_id : false;
	}

	/**
	 * Update submission status
	 *
	 * @since    1.0.0
	 * @param    int      $id       Submission ID
	 * @param    string   $status   New status
	 * @param    string   $error    Error message (optional)
	 * @param    string   $lead_id  CRM lead ID (optional)
	 * @return   bool              True on success, false on failure
	 */
	public function update_submission_status( $id, $status, $error = '', $lead_id = '' ) {
		global $wpdb;

		$table_name = $wpdb->prefix . 'jcrm_submissions';

		$update_data = array(
			'status' => $status,
			'processed_at' => current_time( 'mysql' )
		);

		if ( ! empty( $error ) ) {
			$update_data['error_message'] = $error;
		}

		if ( ! empty( $lead_id ) ) {
			$update_data['crm_lead_id'] = $lead_id;
		}

		$result = $wpdb->update(
			$table_name,
			$update_data,
			array( 'id' => $id ),
			array( '%s', '%s', '%s', '%s' ),
			array( '%d' )
		);

		return $result !== false;
	}

	/**
	 * Get submission statistics
	 *
	 * @since    1.0.0
	 * @param    string   $period   Time period (7d, 30d, 90d)
	 * @return   array             Statistics data
	 */
	public function get_submission_stats( $period = '30d' ) {
		global $wpdb;

		$table_name = $wpdb->prefix . 'jcrm_submissions';

		// Calculate date range
		$days = 30;
		switch ( $period ) {
			case '7d':
				$days = 7;
				break;
			case '90d':
				$days = 90;
				break;
		}

		$start_date = date( 'Y-m-d H:i:s', strtotime( "-$days days" ) );

		// Get total submissions
		$total = $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(*) FROM $table_name WHERE submitted_at >= %s",
			$start_date
		) );

		// Get successful submissions
		$successful = $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(*) FROM $table_name WHERE submitted_at >= %s AND status = 'success'",
			$start_date
		) );

		// Get failed submissions
		$failed = $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(*) FROM $table_name WHERE submitted_at >= %s AND status = 'failed'",
			$start_date
		) );

		// Get last submission
		$last_submission = $wpdb->get_var(
			"SELECT submitted_at FROM $table_name ORDER BY submitted_at DESC LIMIT 1"
		);

		return array(
			'total_submissions' => (int) $total,
			'successful_submissions' => (int) $successful,
			'failed_submissions' => (int) $failed,
			'last_submission' => $last_submission ? strtotime( $last_submission ) : null,
			'period' => $period
		);
	}

	/**
	 * Clean up old submissions
	 *
	 * @since    1.0.0
	 * @param    int      $days     Number of days to keep
	 * @return   int               Number of deleted records
	 */
	public function cleanup_old_submissions( $days = 90 ) {
		global $wpdb;

		$table_name = $wpdb->prefix . 'jcrm_submissions';
		$cutoff_date = date( 'Y-m-d H:i:s', strtotime( "-$days days" ) );

		$deleted = $wpdb->query( $wpdb->prepare(
			"DELETE FROM $table_name WHERE submitted_at < %s",
			$cutoff_date
		) );

		return $deleted;
	}
}