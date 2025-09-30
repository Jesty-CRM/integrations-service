// Jesty CRM Integration Admin JavaScript
(function($) {
    'use strict';
    
    $(document).ready(function() {
        
        // Initialize admin functionality
        initializeAdmin();
        
        // Test connection functionality
        $('#jcrm-test-connection').on('click', function() {
            testConnection();
        });
        
        // Form toggle functionality
        $('.jesty-form-enable').on('change', function() {
            toggleFormSync($(this));
        });
        
        // Refresh forms functionality
        $('#jcrm-refresh-forms').on('click', function() {
            refreshFormsList();
        });
        
        // Auto-save settings on change
        $('#jcrm_integration_key, #jcrm_webhook_url').on('change', function() {
            if ($(this).val()) {
                saveSettings();
            }
        });
        
        // Load statistics
        loadStatistics();
        
        // Auto-refresh stats every 30 seconds
        setInterval(loadStatistics, 30000);
        
    });
    
    function initializeAdmin() {
        // Add loading states
        $(document).on('ajaxStart', function() {
            $('.jesty-crm-admin').addClass('jesty-loading');
        }).on('ajaxStop', function() {
            $('.jesty-crm-admin').removeClass('jesty-loading');
        });
        
        // Initialize tooltips if available
        if ($.fn.tooltip) {
            $('[title]').tooltip();
        }
        
        // Check for pre-configured settings
        checkPreConfiguration();
    }
    
    function checkPreConfiguration() {
        var integrationKey = $('#jcrm_integration_key').val();
        var webhookUrl = $('#jcrm_webhook_url').val();
        
        if (integrationKey && webhookUrl) {
            showNotice('Plugin appears to be pre-configured. Test the connection to verify.', 'info');
        }
    }
    
    function testConnection() {
        var $button = $('#jcrm-test-connection');
        var $result = $('#jcrm-test-result');
        var integrationKey = $('#jcrm_integration_key').val();
        var webhookUrl = $('#jcrm_webhook_url').val();
        
        if (!integrationKey || !webhookUrl) {
            showTestResult('Please enter both Integration Key and Webhook URL', 'error');
            return;
        }
        
        $button.prop('disabled', true).html('Testing... <span class="jesty-spinner"></span>');
        $result.removeClass('success error').hide();
        
        $.ajax({
            url: jcrm_ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'jcrm_test_connection',
                integration_key: integrationKey,
                webhook_url: webhookUrl,
                nonce: jcrm_ajax_object.nonce
            },
            success: function(response) {
                if (response.success) {
                    showTestResult('✅ Connection successful! Your forms will now sync with Jesty CRM.', 'success');
                    updateConnectionStatus(true);
                    
                    // Auto-save settings after successful test
                    saveSettings();
                } else {
                    showTestResult('❌ Connection failed: ' + (response.data || 'Unknown error'), 'error');
                    updateConnectionStatus(false);
                }
            },
            error: function(xhr, status, error) {
                showTestResult('❌ Connection test failed: ' + error, 'error');
                updateConnectionStatus(false);
            },
            complete: function() {
                $button.prop('disabled', false).text('Test Connection');
            }
        });
    }
    
    function showTestResult(message, type) {
        var $result = $('#jcrm-test-result');
        $result.removeClass('success error')
               .addClass(type)
               .html(message)
               .show();
        
        // Auto-hide after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(function() {
                $result.fadeOut();
            }, 5000);
        }
    }
    
    function updateConnectionStatus(connected) {
        var $status = $('.jesty-connection-status');
        if (connected) {
            $status.removeClass('disconnected').addClass('connected').text('Connected');
        } else {
            $status.removeClass('connected').addClass('disconnected').text('Not Connected');
        }
    }
    
    function toggleFormSync($checkbox) {
        var formId = $checkbox.val();
        var enabled = $checkbox.is(':checked');
        
        $.ajax({
            url: jcrm_ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'jcrm_toggle_form',
                form_id: formId,
                enabled: enabled ? 1 : 0,
                nonce: jcrm_ajax_object.nonce
            },
            success: function(response) {
                if (response.success) {
                    showNotice('Form sync ' + (enabled ? 'enabled' : 'disabled') + ' successfully', 'success');
                } else {
                    showNotice('Failed to update form settings', 'error');
                    $checkbox.prop('checked', !enabled); // Revert
                }
            },
            error: function() {
                showNotice('Failed to update form settings', 'error');
                $checkbox.prop('checked', !enabled); // Revert
            }
        });
    }
    
    function refreshFormsList() {
        var $button = $('#jcrm-refresh-forms');
        
        $button.prop('disabled', true).html('Refreshing... <span class="jesty-spinner"></span>');
        
        $.ajax({
            url: jcrm_ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'jcrm_refresh_forms',
                nonce: jcrm_ajax_object.nonce
            },
            success: function(response) {
                if (response.success) {
                    showNotice('Forms list refreshed successfully', 'success');
                    // Reload page to show updated forms
                    setTimeout(function() {
                        location.reload();
                    }, 1000);
                } else {
                    showNotice('Failed to refresh forms list', 'error');
                }
            },
            error: function() {
                showNotice('Failed to refresh forms list', 'error');
            },
            complete: function() {
                $button.prop('disabled', false).text('Refresh');
            }
        });
    }
    
    function saveSettings() {
        var integrationKey = $('#jcrm_integration_key').val();
        var webhookUrl = $('#jcrm_webhook_url').val();
        
        if (!integrationKey || !webhookUrl) {
            return;
        }
        
        $.ajax({
            url: jcrm_ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'jcrm_save_mappings',
                integration_key: integrationKey,
                webhook_url: webhookUrl,
                nonce: jcrm_ajax_object.nonce
            },
            success: function(response) {
                if (response.success) {
                    // Settings saved silently
                    console.log('Settings auto-saved');
                }
            }
        });
    }
    
    function loadStatistics() {
        $.ajax({
            url: jcrm_ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'jcrm_get_stats',
                nonce: jcrm_ajax_object.nonce
            },
            success: function(response) {
                if (response.success && response.data) {
                    updateStatsDisplay(response.data);
                }
            }
        });
    }
    
    function updateStatsDisplay(stats) {
        $('#jesty-stat-total').text(stats.total_submissions || 0);
        $('#jesty-stat-successful').text(stats.successful_submissions || 0);
        $('#jesty-stat-failed').text(stats.failed_submissions || 0);
        
        if (stats.last_submission) {
            var lastDate = new Date(stats.last_submission * 1000);
            $('#jesty-stat-last').text(lastDate.toLocaleString());
        } else {
            $('#jesty-stat-last').text('Never');
        }
        
        // Update success rate color
        var successRate = stats.total_submissions > 0 ? 
            (stats.successful_submissions / stats.total_submissions) * 100 : 0;
        
        var $successStat = $('#jesty-stat-successful');
        if (successRate >= 90) {
            $successStat.css('color', '#28a745');
        } else if (successRate >= 70) {
            $successStat.css('color', '#ffc107');
        } else {
            $successStat.css('color', '#dc3545');
        }
    }
    
    function showNotice(message, type) {
        var $notice = $('<div class="notice notice-' + type + ' is-dismissible jesty-notice"><p>' + message + '</p></div>');
        $('.jesty-crm-admin .wrap h1').after($notice);
        
        // Make dismissible
        $notice.on('click', '.notice-dismiss', function() {
            $notice.fadeOut(function() {
                $notice.remove();
            });
        });
        
        // Auto-dismiss success messages after 5 seconds
        if (type === 'success') {
            setTimeout(function() {
                $notice.fadeOut(function() {
                    $notice.remove();
                });
            }, 5000);
        }
    }
    
    // Handle form submission for settings
    $('#jcrm-settings-form').on('submit', function(e) {
        e.preventDefault();
        
        var $form = $(this);
        var $submitButton = $form.find('input[type="submit"]');
        
        $submitButton.prop('disabled', true).val('Saving...');
        
        // Use native form submission for proper WordPress handling
        setTimeout(function() {
            $form.off('submit').submit();
        }, 100);
    });
    
})(jQuery);

// Global functions for backward compatibility
function jestyTestConnection() {
    jQuery('#jcrm-test-connection').trigger('click');
}

function jestyRefreshForms() {
    jQuery('#jcrm-refresh-forms').trigger('click');
}