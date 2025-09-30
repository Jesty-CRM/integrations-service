// Jesty CRM Integration Public JavaScript
(function($) {
    'use strict';
    
    $(document).ready(function() {
        
        // Initialize public functionality
        initializePublic();
        
        // Handle custom forms with jesty-crm class
        handleCustomForms();
        
    });
    
    function initializePublic() {
        // Add any global public initialization here
        console.log('Jesty CRM Integration loaded');
    }
    
    function handleCustomForms() {
        // Auto-attach to forms with jesty-crm class
        var $customForms = $('.jesty-crm');
        
        if ($customForms.length > 0) {
            console.log('Found ' + $customForms.length + ' custom forms with jesty-crm class');
            
            $customForms.on('submit', function(e) {
                var $form = $(this);
                
                // Don't prevent default submission, just add our handler
                submitCustomForm($form);
            });
        }
    }
    
    function submitCustomForm($form) {
        var formData = new FormData($form[0]);
        
        // Add custom form identifiers
        formData.append('action', 'jcrm_custom_form_submission');
        formData.append('form_plugin', 'custom-form');
        formData.append('form_id', 'custom');
        formData.append('form_name', 'Custom Form');
        formData.append('page_url', window.location.href);
        formData.append('nonce', jcrm_public_ajax.nonce);
        
        // Send to Jesty CRM (don't prevent original form submission)
        $.ajax({
            url: jcrm_public_ajax.ajax_url,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                console.log('Form data sent to Jesty CRM:', response);
            },
            error: function(xhr, status, error) {
                console.error('Error sending form data to Jesty CRM:', error);
            }
        });
    }
    
    // Global function for manual form submission
    window.jestySubmitForm = function(formElement) {
        var $form = $(formElement);
        submitCustomForm($form);
    };
    
})(jQuery);

// Pure JavaScript version for forms that don't use jQuery
if (typeof jQuery === 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        var customForms = document.querySelectorAll('.jesty-crm');
        
        if (customForms.length > 0) {
            console.log('Found ' + customForms.length + ' custom forms with jesty-crm class (vanilla JS)');
            
            customForms.forEach(function(form) {
                form.addEventListener('submit', function(e) {
                    submitCustomFormVanilla(this);
                });
            });
        }
    });
    
    function submitCustomFormVanilla(formElement) {
        var formData = new FormData(formElement);
        
        // Add custom form identifiers
        formData.append('action', 'jcrm_custom_form_submission');
        formData.append('form_plugin', 'custom-form');
        formData.append('form_id', 'custom');
        formData.append('form_name', 'Custom Form');
        formData.append('page_url', window.location.href);
        
        // Send to WordPress AJAX endpoint
        fetch(jcrm_public_ajax.ajax_url, {
            method: 'POST',
            body: formData
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            console.log('Form data sent to Jesty CRM:', data);
        })
        .catch(function(error) {
            console.error('Error sending form data to Jesty CRM:', error);
        });
    }
    
    // Global function for manual form submission (vanilla JS)
    window.jestySubmitForm = function(formElement) {
        submitCustomFormVanilla(formElement);
    };
}